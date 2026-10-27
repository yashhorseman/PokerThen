import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_VERSION, T, WS_CLOSE } from "@pokerthen/shared";
import { parseClientMsg } from "@pokerthen/shared/validators";
import type { Env } from "../env.js";
import { LIMITS, RateWindow } from "../limits.js";
import { clientIp, isOriginAllowed } from "../security.js";
import { identify } from "../http/session-http.js";
import type { Registry } from "../tables/registry.js";
import { Conn } from "./conn.js";

/** WebSocket hub: upgrade checks (Origin, session, game, per-IP cap), registered/gC/rup/chat, keep-alive, presence. */
export class Hub {
  private wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.MAX_WS_MESSAGE_BYTES, perMessageDeflate: false });
  private perIp = new Map<string, number>();
  /** SECURITY: every connect is a durable state write; bound upgrades per IP */
  private upgrades = new RateWindow(LIMITS.WS_UPGRADES_PER_WINDOW, LIMITS.WS_UPGRADE_WINDOW_MS);
  private conns = new Set<Conn>();
  private keepAlive: NodeJS.Timeout;
  private pingTimer: NodeJS.Timeout;

  constructor(private server: Server, private env: Env, private registry: Registry, private clock: () => number, private log: (m: string, e?: unknown) => void) {
    server.on("upgrade", (req, socket, head) => this.onUpgrade(req, socket as Duplex, head));
    this.keepAlive = setInterval(() => { for (const t of registry.all()) if (t.subs.size) t.keepAlive(); }, LIMITS.KEEPALIVE_FRAME_MS);
    this.pingTimer = setInterval(() => this.pingAll(), T.APP_PING);
    this.keepAlive.unref(); this.pingTimer.unref();
  }

  get socketCount(): number { return this.conns.size; }

  private reject(socket: Duplex, status: number, text: string): void {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on("error", () => { /* handshake aborted */ });
    let url: URL;
    try { url = new URL(req.url ?? "/", "http://x"); } catch { return this.reject(socket, 400, "Bad Request"); }
    if (url.pathname !== "/ws") return this.reject(socket, 404, "Not Found");
    if (!isOriginAllowed(req, this.env)) return this.reject(socket, 403, "Forbidden"); // close code 4403 is meaningless pre-handshake
    const ip = clientIp(req, this.env);
    const me = identify(req, this.env, url.searchParams.get("ut"));
    const gameID = url.searchParams.get("gameID") ?? "";
    const tooMany = (this.perIp.get(ip) ?? 0) >= LIMITS.MAX_SOCKETS_PER_IP || !this.upgrades.hit(ip);
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const closeWith = (code: number, failed?: string): void => {
        try { if (failed) ws.send(JSON.stringify({ t: "failed", code: failed })); } catch { /* ignore */ }
        ws.close(code, failed ?? "");
      };
      if (!me) return closeWith(WS_CLOSE.NO_SESSION, "session-missing-token");
      const runner = this.registry.get(gameID);
      if (!runner) return closeWith(WS_CLOSE.UNKNOWN_GAME, "unknown-game");
      if (tooMany) return closeWith(WS_CLOSE.TOO_MANY_CONNECTIONS, "too-many-connections");
      this.attach(ws, runner, me.id, ip);
    });
  }

  private attach(ws: WebSocket, runner: import("../tables/runner.js").TableRunner, viewer: string, ip: string): void {
    const conn = new Conn(ws, runner, viewer, ip, this.clock);
    this.conns.add(conn);
    this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1);
    ws.on("pong", () => { conn.alive = true; conn.lastSeenAt = this.clock(); });
    ws.on("error", () => ws.terminate());
    ws.on("close", () => this.onClose(conn));
    ws.on("message", (data, isBinary) => this.onMessage(conn, data, isBinary));
    // presence first (may broadcast to others), then register this socket with a full frame
    runner.addSub(conn);
    const frame = conn.fullFrame();
    const engineView = frame.you;
    conn.send({
      t: "registered",
      frame,
      you: {
        id: viewer,
        name: engineView?.name ?? "",
        mutedIds: engineView?.mutedIds ?? [],
        straddling: engineView?.straddling ?? false
      }
    });
    conn.registered = true;
    conn.send({ t: "rEM", version: runner.emojiVersion, emojis: { ...runner.emojis } });
    conn.send({ t: "chatHistory", messages: runner.chatHistoryFor(viewer) });
  }

  private onClose(conn: Conn): void {
    if (conn.closed) return;
    conn.closed = true;
    if (conn.pongTimer) clearTimeout(conn.pongTimer);
    this.conns.delete(conn);
    const n = (this.perIp.get(conn.ip) ?? 1) - 1;
    if (n <= 0) this.perIp.delete(conn.ip); else this.perIp.set(conn.ip, n);
    conn.runner.removeSub(conn);
  }

  private onMessage(conn: Conn, data: unknown, isBinary: boolean): void {
    conn.lastSeenAt = this.clock();
    const t = this.clock();
    conn.msgTimes = conn.msgTimes.filter((x) => x > t - LIMITS.WS_MSG_WINDOW_MS);
    conn.msgTimes.push(t);
    if (conn.msgTimes.length > LIMITS.WS_MSG_BURST) {
      conn.send({ t: "failed", code: "too-many-actions" });
      conn.ws.close(WS_CLOSE.TOO_MANY_ACTIONS, "too-many-actions");
      return;
    }
    if (isBinary) return;
    const msg = parseClientMsg(String(data));
    if (!msg) { this.log(`[ws ${conn.runner.id}] malformed message from ${conn.viewer}`); return; }
    const r = conn.runner;
    switch (msg.t) {
      case "ping":
        conn.send({ t: "pong", ts: msg.ts, serverNow: this.clock() });
        return;
      case "rue":
        conn.send({ t: "rEM", version: r.emojiVersion, emojis: { ...r.emojis } });
        return;
      case "chat":
        r.postChat(conn.viewer, msg.text);
        return;
      case "action": {
        const a = msg.action;
        if (a.type === "RUP") {
          conn.send({ t: "rup", frame: conn.fullFrame() });
          return;
        }
        if (!conn.registered) return;
        if (a.type === "ME") { r.setEmoji(conn.viewer, a.emoji); return; }
        const res = r.exec(conn.viewer, { kind: "action", action: a });
        if (!res.ok) this.log(`[ws ${r.id}] action ${a.type} from ${conn.viewer} ignored: ${JSON.stringify(res)}`);
        return;
      }
    }
  }

  /** WebSocket protocol ping every 20 s; a socket silent for 5 s after the ping is terminated (SPEC 21). */
  private pingAll(): void {
    for (const c of this.conns) {
      c.alive = false;
      const sentAt = this.clock();
      try { c.ws.ping(); } catch { c.ws.terminate(); continue; }
      c.pongTimer = setTimeout(() => {
        if (!c.alive && c.lastSeenAt < sentAt) c.ws.terminate();
      }, T.PONG_TIMEOUT);
      c.pongTimer.unref?.();
    }
  }

  closeAll(code: number = 1001): void {
    clearInterval(this.keepAlive); clearInterval(this.pingTimer);
    for (const c of this.conns) { try { c.ws.close(code, "server shutting down"); } catch { /* ignore */ } }
  }
  terminateAll(): void { for (const c of this.conns) c.ws.terminate(); }
}

export const SERVER_VERSION = PROTOCOL_VERSION;
