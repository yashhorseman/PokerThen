import type WebSocket from 'ws';
import type { ClientMessage, ServerMessage, PlayerId, RpcErrorBody, RpcMethodName } from '../shared/protocol';
import { TIMING } from '../shared/constants';
import type { GameEngine } from '../engine/types';
import { RpcError } from '../engine/types';
import type { Persistence } from './persist';

export interface Client {
  ws: WebSocket;
  playerId: PlayerId;
  ip: string;
  layout: 'd' | 'm';
  alive: boolean;
  lastSeen: number;
  tokens: number; // rate limiting bucket
  tokensAt: number;
}

const BUCKET_CAP = 60;
const BUCKET_REFILL_PER_SEC = 25;
const MAX_CLIENTS_PER_ROOM = 120;

/** One table: the engine + its sockets + persistence + the wake-up timer. */
export class Room {
  readonly clients = new Set<Client>();
  private timer: NodeJS.Timeout | null = null;
  private broadcastPending = false;
  lastActivity = Date.now();

  constructor(readonly game: GameEngine, private persist: Persistence) {}

  get id() { return this.game.id; }

  // ── commit: persist BEFORE acknowledging, then fan out ──
  commit() {
    const now = Date.now();
    const dirty = this.game.takeDirty();
    const chat = this.game.drainChat();
    if (dirty || chat.length) this.persist.save(this.id, this.game.serialize());
    for (const msg of chat) this.sendAll({ t: 'chat', msg });
    if (dirty) this.scheduleBroadcast();
    this.reschedule(now);
  }

  private scheduleBroadcast() {
    if (this.broadcastPending) return;
    this.broadcastPending = true;
    setImmediate(() => { this.broadcastPending = false; this.broadcast(); });
  }

  broadcast() {
    const now = Date.now();
    for (const c of this.clients) {
      try { this.send(c, { t: 'frame', frame: this.game.frameFor(c.playerId, now) }); } catch (e) { console.error('frameFor failed', this.id, e); }
    }
  }

  private reschedule(now: number) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const next = this.game.nextWakeAt();
    if (next == null) return;
    const delay = Math.min(Math.max(0, next - now), 30_000);
    this.timer = setTimeout(() => this.tick(), delay);
    this.timer.unref?.();
  }

  tick() {
    this.timer = null;
    try { this.game.tick(Date.now()); } catch (e) { console.error('tick failed', this.id, e); }
    this.commit();
  }

  // ── sockets ──
  join(c: Client): boolean {
    if (this.clients.size >= MAX_CLIENTS_PER_ROOM) return false;
    const now = Date.now();
    this.clients.add(c);
    this.lastActivity = now;
    this.game.ensurePlayer(c.playerId, now);
    this.game.setConnected(c.playerId, true, now);
    this.commit();
    this.send(c, { t: 'registered', frame: this.game.frameFor(c.playerId, now), chat: this.game.chatHistory(c.playerId), serverNow: now });
    return true;
  }

  leave(c: Client) {
    if (!this.clients.delete(c)) return;
    const stillThere = [...this.clients].some((x) => x.playerId === c.playerId);
    if (!stillThere) { this.game.setConnected(c.playerId, false, Date.now()); this.commit(); }
  }

  handle(c: Client, raw: string) {
    const now = Date.now();
    // token bucket
    c.tokens = Math.min(BUCKET_CAP, c.tokens + ((now - c.tokensAt) / 1000) * BUCKET_REFILL_PER_SEC);
    c.tokensAt = now;
    if (--c.tokens < 0) { this.send(c, { t: 'failed', code: 'too-many-actions', msg: 'You were disconnected because you sent too many actions.' }); c.ws.close(4008, 'too many actions'); return; }
    let m: ClientMessage;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    c.lastSeen = now; this.lastActivity = now;
    switch (m.t) {
      case 'ping': this.send(c, { t: 'pong' }); return;
      case 'action': {
        if (!m.action || typeof m.action !== 'object' || typeof m.action.type !== 'string') return;
        if (m.action.type === 'RUP') { this.send(c, { t: 'frame', frame: this.game.frameFor(c.playerId, now) }); return; }
        try { this.game.action(c.playerId, m.action, now); } catch (e) { if (!(e instanceof RpcError)) console.error('action failed', this.id, m.action.type, e); }
        this.commit();
        return;
      }
      case 'rpc': {
        const id = Number(m.id);
        if (!Number.isFinite(id) || typeof m.method !== 'string') return;
        let result: ServerMessage;
        try {
          const data = this.game.rpc(c.playerId, m.method as RpcMethodName, (m.params ?? {}) as never, now);
          this.commit(); // durable before the ack
          result = { t: 'rpcResult', id, ok: true, data };
        } catch (e) {
          this.commit();
          let error: RpcErrorBody;
          if (e instanceof RpcError) error = e.body;
          else { console.error('rpc failed', this.id, m.method, e); error = { status: 500, message: 'internal error' }; }
          result = { t: 'rpcResult', id, ok: false, error };
        }
        this.send(c, result);
        return;
      }
    }
  }

  send(c: Client, m: ServerMessage) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); }
  sendAll(m: ServerMessage) { const s = JSON.stringify(m); for (const c of this.clients) if (c.ws.readyState === 1) c.ws.send(s); }

  /** drop dead sockets (no pong for PING_TIMEOUT_MS) */
  reap(now: number) {
    for (const c of this.clients) if (now - c.lastSeen > TIMING.PING_TIMEOUT_MS) c.ws.terminate();
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.sendAll({ t: 'disposed' });
    for (const c of this.clients) c.ws.close(1001, 'disposed');
  }
}
