import {
  applyDelta,
  TABLE_BUBBLE_MS,
  truncateBubble,
  type CardCode,
  type ChatMessage,
  type ConnectionVM,
  type Frame,
  type FrameDelta,
  type PlayerId,
  type ServerMsg
} from "@pokerthen/shared";
import { ServerClock } from "../clock";

export interface YouInfo {
  id: PlayerId;
  name: string;
  mutedIds: PlayerId[];
  straddling: boolean;
}
export interface Bubble {
  text: string;
  until: number;
}
export interface Notice {
  id: number;
  kind: "profanity" | "maintenance" | "ownershipTransferred" | "removed" | "spectatorWarning";
  message: string;
  data?: Record<string, unknown>;
}

/** GameStore (ARCH 10.1): `{frame, prev, connection, chat, emojis, clockOffset}` plus a few UI slices. */
export interface GameState {
  gameId: string;
  frame: Frame | null;
  prev: Frame | null;
  you: YouInfo | null;
  connection: ConnectionVM;
  chat: ChatMessage[];
  unread: number;
  chatOpen: boolean;
  emojis: Record<PlayerId, string | null>;
  emojiVersion: number;
  bubbles: Record<PlayerId, Bubble>;
  notices: Notice[];
  /** own hole cards remembered for the dim display after folding (frames drop folded cards) */
  ownCards: { handId: string; cards: CardCode[] } | null;
  /** local run-it-twice answer for the current hand */
  ritAnswered: { handNumber: number; value: boolean } | null;
  /** epoch ms until which the action buttons are locked (750 ms after a click) */
  lockedUntil: number;
}

export type StoreEvent =
  | { type: "frame"; kind: "registered" | "delta" | "rup"; prev: Frame | null; next: Frame }
  | { type: "chat"; message: ChatMessage; own: boolean }
  | { type: "notice"; notice: Notice };

export type DeltaResult = "applied" | "gap" | "noop";

let noticeSeq = 1;

export function initialState(gameId: string): GameState {
  return {
    gameId,
    frame: null,
    prev: null,
    you: null,
    connection: { status: "connecting" },
    chat: [],
    unread: 0,
    chatOpen: false,
    emojis: {},
    emojiVersion: -1,
    bubbles: {},
    notices: [],
    ownCards: null,
    ritAnswered: null,
    lockedUntil: 0
  };
}

export const bubbleText = truncateBubble;

export class GameStore {
  private state: GameState;
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(e: StoreEvent) => void>();
  readonly clock: ServerClock;

  constructor(gameId: string, clock: ServerClock = new ServerClock()) {
    this.state = initialState(gameId);
    this.clock = clock;
  }

  getState = (): GameState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  onEvent(fn: (e: StoreEvent) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private set(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }
  private emit(e: StoreEvent): void {
    for (const l of [...this.eventListeners]) l(e);
  }

  /* ---------- connection ---------- */
  setConnection(c: ConnectionVM): void {
    const cur = this.state.connection;
    if (cur.status === c.status && cur.failedCode === c.failedCode && cur.failedMsg === c.failedMsg) return;
    this.set({ connection: c });
  }

  /* ---------- frames ---------- */
  private afterFrame(next: Frame, prev: Frame | null, extra: Partial<GameState> = {}): Partial<GameState> {
    this.clock.update(next.meta.sN);
    const youId = next.you?.id ?? this.state.you?.id ?? null;
    let ownCards = this.state.ownCards;
    const hand = next.hand;
    if (youId && hand) {
      const mine = next.cards[youId]?.cards ?? [];
      const codes = mine.map((c) => c.value).filter((v): v is CardCode => v !== null);
      if (codes.length) ownCards = { handId: hand.handId, cards: codes };
      else if (ownCards && ownCards.handId !== hand.handId) ownCards = null;
    } else if (!hand) ownCards = null;
    let you = this.state.you;
    if (next.you && you) you = { ...you, id: next.you.id, name: next.you.name };
    if (next.you && !you) you = { id: next.you.id, name: next.you.name, mutedIds: next.you.mutedIds, straddling: next.you.straddling };
    return { frame: next, prev, ownCards, you, ...extra };
  }

  applyRegistered(frame: Frame, you: { id: PlayerId; name: string; mutedIds: PlayerId[]; straddling: boolean }): void {
    // A full snapshot is replayed through the same path as first load: no previous frame (cards pre-flipped).
    const youInfo: YouInfo = { id: you.id, name: you.name, mutedIds: you.mutedIds, straddling: you.straddling };
    this.state = { ...this.state, you: youInfo };
    const patch = this.afterFrame(frame, null, { you: youInfo, connection: { status: "connected" }, ritAnswered: null });
    this.set(patch);
    this.emit({ type: "frame", kind: "registered", prev: null, next: frame });
  }

  /** returns "gap" when the chain is broken (caller must send RUP and ignore deltas until the `rup` frame). */
  applyDeltaMsg(delta: FrameDelta): DeltaResult {
    const cur = this.state.frame;
    if (!cur) return "gap";
    const meta = (delta as { meta?: { pre?: number } }).meta;
    if (!meta || meta.pre !== cur.meta.now) return "gap";
    const next = applyDelta<Frame>(cur, delta);
    let ritAnswered = this.state.ritAnswered;
    if (ritAnswered && next.hand?.handNumber !== ritAnswered.handNumber) ritAnswered = null;
    this.set(this.afterFrame(next, cur, { ritAnswered }));
    this.emit({ type: "frame", kind: "delta", prev: cur, next });
    return "applied";
  }

  applyRup(frame: Frame): void {
    const prev = this.state.frame;
    this.set(this.afterFrame(frame, prev));
    this.emit({ type: "frame", kind: "rup", prev, next: frame });
  }

  /* ---------- identity ---------- */
  applyIgpu(you: { name: string; mutedIds: PlayerId[]; straddling: boolean }): void {
    const cur = this.state.you;
    if (!cur) return;
    this.set({ you: { ...cur, name: you.name, mutedIds: you.mutedIds, straddling: you.straddling } });
  }
  setLocalMuted(playerId: PlayerId, muted: boolean): void {
    const cur = this.state.you;
    if (!cur) return;
    const has = cur.mutedIds.includes(playerId);
    if (has === muted) return;
    this.set({ you: { ...cur, mutedIds: muted ? [...cur.mutedIds, playerId] : cur.mutedIds.filter((x) => x !== playerId) } });
  }

  /* ---------- chat ---------- */
  setChatHistory(messages: ChatMessage[]): void {
    this.set({ chat: messages.slice(-200), unread: 0 });
  }
  pushChat(message: ChatMessage, now: number = this.clock.now()): void {
    const own = !!message.playerID && message.playerID === this.state.you?.id;
    const chat = [...this.state.chat, message].slice(-200);
    const bubbles =
      message.playerID && !message.autoMessage
        ? { ...this.state.bubbles, [message.playerID]: { text: bubbleText(message.message), until: now + TABLE_BUBBLE_MS } }
        : this.state.bubbles;
    const unread = !own && !this.state.chatOpen && !message.autoMessage ? this.state.unread + 1 : this.state.unread;
    this.set({ chat, bubbles, unread });
    this.emit({ type: "chat", message, own });
  }
  setChatOpen(open: boolean): void {
    if (open === this.state.chatOpen && (!open || this.state.unread === 0)) return;
    this.set({ chatOpen: open, unread: open ? 0 : this.state.unread });
  }
  markChatRead(): void {
    if (this.state.unread) this.set({ unread: 0 });
  }
  /** drops expired bubbles; returns the next expiry (ms) or null */
  pruneBubbles(now: number): number | null {
    const entries = Object.entries(this.state.bubbles);
    const alive = entries.filter(([, b]) => b.until > now);
    if (alive.length !== entries.length) this.set({ bubbles: Object.fromEntries(alive) });
    return alive.length ? Math.min(...alive.map(([, b]) => b.until)) : null;
  }

  /* ---------- emojis ---------- */
  /** false => version gap: caller sends `rue` */
  applyEmojiDelta(version: number, playerId: PlayerId, emoji: string | null): boolean {
    const cur = this.state.emojiVersion;
    if (version <= cur) return true;
    if (cur >= 0 && version !== cur + 1) return false;
    this.set({ emojis: { ...this.state.emojis, [playerId]: emoji }, emojiVersion: version });
    return true;
  }
  applyEmojiFull(version: number, emojis: Record<PlayerId, string | null>): void {
    this.set({ emojis: { ...emojis }, emojiVersion: version });
  }

  /* ---------- misc ---------- */
  pushNotice(n: Omit<Notice, "id">): void {
    const notice = { ...n, id: noticeSeq++ };
    this.set({ notices: [...this.state.notices, notice] });
    this.emit({ type: "notice", notice });
  }
  dismissNotice(id: number): void {
    this.set({ notices: this.state.notices.filter((n) => n.id !== id) });
  }
  setLockedUntil(ts: number): void {
    this.set({ lockedUntil: ts });
  }
  setRitAnswered(handNumber: number, value: boolean): void {
    this.set({ ritAnswered: { handNumber, value } });
  }

  /** Apply any ServerMsg that does not need the socket (used by tests and the mock). Returns the delta result for gC. */
  reduce(msg: ServerMsg): DeltaResult | null {
    switch (msg.t) {
      case "registered":
        this.applyRegistered(msg.frame, msg.you);
        return null;
      case "gC":
        return this.applyDeltaMsg(msg.delta);
      case "rup":
        this.applyRup(msg.frame);
        return null;
      case "chat":
        this.pushChat(msg.message);
        return null;
      case "chatHistory":
        this.setChatHistory(msg.messages);
        return null;
      case "igpu":
        this.applyIgpu(msg);
        return null;
      case "rEM":
        this.applyEmojiFull(msg.version, msg.emojis);
        return null;
      case "nEM":
        this.applyEmojiDelta(msg.version, msg.playerId, msg.emoji);
        return null;
      case "notice":
        this.pushNotice({ kind: msg.kind, message: msg.message, ...(msg.data ? { data: msg.data } : {}) });
        return null;
      default:
        return null;
    }
  }
}
