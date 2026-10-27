import {
  T,
  WS_CLOSE,
  type ActionMsg,
  type ClientMsg,
  type ServerMsg
} from "@pokerthen/shared";
import type { GameStore } from "../store/gameStore";

/** Minimal WebSocket surface (real WebSocket and the scripted/mocked sockets both fit). */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface SessionDeps {
  store: GameStore;
  /** opens a socket for the full URL (`/ws?gameID=..&layout=..`) */
  createSocket: (url: string) => SocketLike;
  /** builds the absolute ws url from the query string, e.g. "gameID=x&layout=d" */
  buildUrl?: (query: string) => string;
  layout: () => "d" | "m";
  random?: () => number;
  /** called for HTTP 202-like situations: protocol version mismatch => reload (SPEC 21) */
  onReload?: () => void;
  /** called before every (re)connect; e.g. to make sure the `ptn` cookie exists in dev */
  beforeConnect?: () => Promise<void> | void;
}

export function defaultBuildUrl(query: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws?${query}`;
}

/** Terminal failure codes mapped from WS close codes (ARCH 5.2). */
const CLOSE_TO_FAILED: Record<number, string | undefined> = {
  [WS_CLOSE.NO_SESSION]: "session-missing-token",
  [WS_CLOSE.TOO_MANY_CONNECTIONS]: "too-many-connections",
  [WS_CLOSE.TOO_MANY_ACTIONS]: "too-many-actions",
  [WS_CLOSE.BAD_ORIGIN]: "bad-origin",
  [WS_CLOSE.UNKNOWN_GAME]: "unknown-game"
};

/**
 * One game session: connect, reconnect with backoff, 20 s app ping + 5 s pong watchdog, delta chain with RUP
 * (ARCH 5.2/5.3, SPEC 21). All timing uses global timers so tests can drive it with vi.useFakeTimers().
 */
export class GameSession {
  private socket: SocketLike | null = null;
  private attempt = 0;
  private firstConnection = true;
  private registered = false;
  private everRegistered = false;
  private awaitingRup = false;
  private awaitingEmojis = false;
  private terminal = false;
  private stopped = false;
  private knownVersion: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private opening = false;
  /** exposed for tests/diagnostics */
  readonly stats = { connects: 0, rups: 0, rues: 0, droppedActions: 0 };

  constructor(private readonly deps: SessionDeps) {}

  get isRegistered(): boolean {
    return this.registered;
  }

  start(): void {
    this.stopped = false;
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const s = this.socket;
    this.socket = null;
    this.registered = false;
    if (s) {
      s.onclose = s.onmessage = s.onopen = s.onerror = null;
      try {
        s.close(WS_CLOSE.NORMAL);
      } catch {
        /* ignore */
      }
    }
  }

  /** immediate reconnect (disconnect banner click) */
  reconnectNow(): void {
    if (this.stopped) return;
    this.terminal = false;
    this.attempt = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.dropSocket();
    void this.open();
  }

  /* ---------- outgoing ---------- */
  private sendRaw(msg: ClientMsg): boolean {
    const s = this.socket;
    if (!s) return false;
    try {
      s.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** Actions get no ack. Before `registered` they are dropped except RUP (ARCH 5.2). */
  sendAction(action: ActionMsg): boolean {
    if (!this.registered && action.type !== "RUP") {
      this.stats.droppedActions++;
      return false;
    }
    return this.sendRaw({ t: "action", action });
  }
  sendChat(text: string): boolean {
    if (!this.registered) return false;
    return this.sendRaw({ t: "chat", text });
  }

  /* ---------- connect ---------- */
  private async open(): Promise<void> {
    if (this.opening || this.stopped) return;
    this.opening = true;
    try {
      if (this.deps.beforeConnect) {
        try {
          await this.deps.beforeConnect();
        } catch {
          /* cookie bootstrap is best effort */
        }
      }
    } finally {
      this.opening = false;
    }
    if (this.stopped || this.socket) return;
    const { store } = this.deps;
    const status = store.getState().connection.status;
    if (status !== "failed") store.setConnection({ status: this.everRegistered ? "disconnected" : "connecting" });
    const query = `gameID=${encodeURIComponent(store.getState().gameId)}&layout=${this.deps.layout()}${this.firstConnection ? "&firstConnection=true" : ""}`;
    this.firstConnection = false;
    const url = (this.deps.buildUrl ?? defaultBuildUrl)(query);
    let sock: SocketLike;
    try {
      sock = this.deps.createSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = sock;
    this.stats.connects++;
    this.connectTimer = setTimeout(() => {
      if (this.socket !== sock || this.registered) return;
      // connect timeout (20 s): first connection shows the failure card, but we keep retrying
      if (!this.everRegistered) store.setConnection({ status: "failed" });
      this.dropSocket();
      this.scheduleReconnect();
    }, T.CONNECT_TIMEOUT);
    sock.onopen = () => {
      if (this.socket !== sock) return;
      this.startPing();
    };
    sock.onmessage = (ev) => {
      if (this.socket !== sock) return;
      this.onMessage(ev.data);
    };
    sock.onerror = () => {
      /* close follows */
    };
    sock.onclose = (ev) => {
      if (this.socket !== sock) return;
      this.onClosed(ev.code);
    };
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (!this.socket) return;
      this.sendRaw({ t: "ping", ts: Date.now() });
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        // no pong within 5 s: the connection is considered dead
        this.dropSocket();
        this.deps.store.setConnection({ status: "disconnected" });
        this.scheduleReconnect();
      }, T.PONG_TIMEOUT);
    }, T.APP_PING);
  }

  private clearTimers(): void {
    for (const t of [this.reconnectTimer, this.connectTimer, this.pongTimer]) if (t) clearTimeout(t);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = this.connectTimer = this.pongTimer = null;
    this.pingTimer = null;
  }

  private dropSocket(): void {
    const s = this.socket;
    this.socket = null;
    this.registered = false;
    this.awaitingRup = false;
    for (const t of [this.connectTimer, this.pongTimer]) if (t) clearTimeout(t);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.connectTimer = this.pongTimer = null;
    this.pingTimer = null;
    if (s) {
      s.onclose = s.onmessage = s.onopen = s.onerror = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
  }

  private onClosed(code: number): void {
    this.dropSocket();
    if (this.stopped) return;
    const { store } = this.deps;
    if (code === WS_CLOSE.DISPOSED) {
      this.terminal = true;
      store.setConnection({ status: "disposed" });
      return;
    }
    if (code in CLOSE_TO_FAILED) {
      this.terminal = true;
      store.setConnection({ status: "failed", failedCode: CLOSE_TO_FAILED[code]! });
      return;
    }
    if (this.terminal) return;
    store.setConnection({ status: this.everRegistered ? "disconnected" : "connecting" });
    this.scheduleReconnect();
  }

  /** exponential backoff 1 s .. 5 s with jitter .5, infinite attempts (SPEC 21) */
  nextDelay(): number {
    const rnd = (this.deps.random ?? Math.random)();
    const base = Math.min(T.RECONNECT_MAX, T.RECONNECT_MIN * 2 ** this.attempt);
    const jittered = base * (1 + (rnd - 0.5) * 0.5);
    return Math.min(T.RECONNECT_MAX, Math.max(T.RECONNECT_MIN * 0.5, jittered));
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.terminal || this.reconnectTimer) return;
    const delay = this.nextDelay();
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, delay);
  }

  /* ---------- incoming ---------- */
  private onMessage(raw: unknown): void {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(raw)) as ServerMsg;
    } catch {
      return;
    }
    const { store } = this.deps;
    switch (msg.t) {
      case "registered": {
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.connectTimer = null;
        if (this.knownVersion !== null && msg.frame.meta.version !== this.knownVersion) {
          this.deps.onReload?.();
          return;
        }
        this.knownVersion = msg.frame.meta.version;
        this.registered = true;
        this.everRegistered = true;
        this.awaitingRup = false;
        this.attempt = 0;
        store.applyRegistered(msg.frame, msg.you);
        if (msg.frame.meta.mEV !== store.getState().emojiVersion) this.requestEmojis();
        return;
      }
      case "gC": {
        if (this.awaitingRup) return;
        const r = store.applyDeltaMsg(msg.delta);
        if (r === "gap") this.requestFullFrame();
        else if (r === "applied") {
          const mEV = store.getState().frame?.meta.mEV;
          if (mEV !== undefined && mEV !== store.getState().emojiVersion && !this.awaitingEmojis) this.requestEmojis();
        }
        return;
      }
      case "rup":
        this.awaitingRup = false;
        store.applyRup(msg.frame);
        return;
      case "nEM":
        if (!store.applyEmojiDelta(msg.version, msg.playerId, msg.emoji)) this.requestEmojis();
        return;
      case "rEM":
        this.awaitingEmojis = false;
        store.applyEmojiFull(msg.version, msg.emojis);
        return;
      case "pong":
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      case "disposed":
        this.terminal = true;
        store.setConnection({ status: "disposed" });
        return;
      case "failed":
        this.terminal = true;
        store.setConnection({
          status: "failed",
          ...(msg.code !== undefined ? { failedCode: msg.code } : {}),
          ...(msg.msg !== undefined ? { failedMsg: msg.msg } : {})
        });
        return;
      default:
        store.reduce(msg);
    }
  }

  private requestFullFrame(): void {
    this.awaitingRup = true;
    this.stats.rups++;
    this.sendRaw({ t: "action", action: { type: "RUP" } });
  }
  private requestEmojis(): void {
    this.awaitingEmojis = true;
    this.stats.rues++;
    this.sendRaw({ t: "rue" });
  }
}
