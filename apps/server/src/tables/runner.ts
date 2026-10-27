import type {
  ChatMessage, CommandResult, EngineApi, EngineCommand, EngineCtx, EngineEffect, Entropy, Frame, PlayerId, TableState
} from "@pokerthen/shared";
import { ChatStore, SYSTEM_SENDER, type ProfanityFilter, sanitizeChat, type StoredChat } from "../chat/chat.js";
import { FairnessStore } from "../fairness/store.js";
import { LogStore } from "../logs/store.js";
import { type DurableFs } from "../persistence/fsio.js";
import { LIMITS } from "../limits.js";
import { PersistenceError, TableStore, type StateDoc } from "../persistence/tableStore.js";

export type ExecResult = CommandResult | { ok: false; status: 500 | 503; code: string };

/** What the runner needs from a connected socket (implemented in ws/conn.ts). */
export interface Subscriber {
  readonly viewer: PlayerId;
  readonly registered: boolean;
  /** compute + send a delta if the projection changed (force = keep-alive) */
  pushUpdate(force?: boolean): void;
  send(msg: unknown): void;
}

export interface RunnerDeps {
  engine: EngineApi;
  entropy: Entropy;
  clock: () => number;
  fs: DurableFs;
  dataDir: string;
  profanity: ProfanityFilter;
  log: (msg: string, err?: unknown) => void;
}

const MAX_TIMER_MS = 30_000;

/**
 * One table: authoritative in-memory state + strictly serial command pipeline (the pipeline is fully synchronous, so two
 * commands can never interleave): engine.command -> durable commit (log/fairness/chat appends, then state.json) ->
 * memory update -> broadcast. Nothing is acknowledged or broadcast unless the commit succeeded.
 */
export class TableRunner {
  state: TableState;
  seq: number;
  readonly store: TableStore;
  readonly logs: LogStore;
  readonly fairness: FairnessStore;
  readonly chat: ChatStore;
  readonly subs = new Set<Subscriber>();
  private presence = new Map<PlayerId, number>();
  emojis: Record<PlayerId, string | null> = {};
  emojiVersion = 0;
  private timer: NodeJS.Timeout | null = null;
  private timerFor: number | null = null;
  broken = false;
  disposed = false;
  /** SECURITY: per-player chat limiter + persisted-line counter (chat.jsonl is append-only) */
  private chatHits = new Map<PlayerId, number[]>();
  chatCount = 0;
  lastTouchedAt: number;

  private constructor(readonly id: string, private d: RunnerDeps, state: TableState, seq: number, logs: LogStore, fairness: FairnessStore, chat: ChatStore) {
    this.state = state; this.seq = seq; this.logs = logs; this.fairness = fairness; this.chat = chat;
    this.store = new TableStore(d.dataDir, id, d.fs);
    this.lastTouchedAt = d.clock();
  }

  /** New table: createTable + first durable commit. Throws PersistenceError (and cleans up) when the disk refuses. */
  static create(id: string, d: RunnerDeps, p: { ownerId: PlayerId; ownerName: string; stack: number; sb: number; bb: number }): TableRunner {
    const now = d.clock();
    const ctx: EngineCtx = { now, entropy: d.entropy };
    const { state, effects } = d.engine.createTable({ gameId: id, ...p }, ctx);
    const r = new TableRunner(id, d, state, 0, new LogStore(), new FairnessStore(), new ChatStore());
    try {
      r.store.init();
      r.persist(state, effects, now, 0);
    } catch (e) {
      try { d.fs.remove(r.store.dir); } catch { /* ignore */ }
      throw e;
    }
    r.applyMemory(effects, r.lastPlan!);
    r.rearm();
    return r;
  }

  /** Boot recovery: rebuild from disk, then `resume{downtimeMs}` through the normal pipeline. */
  static recover(id: string, d: RunnerDeps, doc: StateDoc, rows: { log: unknown[]; fairness: unknown[]; chat: unknown[] }): TableRunner {
    const fairRows = (rows.fairness as Array<Record<string, unknown>>).map((o) => FairnessStore.fromLine(o));
    const fair = new FairnessStore();
    for (const fr of fairRows) fair.add(fr);
    const r = new TableRunner(id, d, doc.state as TableState, doc.seq, LogStore.fromRows(rows.log), fair, ChatStore.fromRows(rows.chat));
    r.chatCount = rows.chat.length;
    const now = d.clock();
    const res = r.exec("system", { kind: "resume", downtimeMs: Math.max(0, now - doc.savedAtMs) });
    if (!res.ok) d.log(`[table ${id}] resume failed: ${JSON.stringify(res)}`);
    r.rearm();
    return r;
  }

  private ctx(now: number): EngineCtx { return { now, entropy: this.d.entropy }; }

  /* ---------------- command pipeline ---------------- */

  exec(actor: PlayerId | "system", cmd: EngineCommand): ExecResult {
    if (this.broken) return { ok: false, status: 503, code: "persistence-broken" };
    const now = this.d.clock();
    let res: CommandResult;
    try {
      res = this.d.engine.command(this.state, actor, cmd, this.ctx(now));
    } catch (e) {
      this.d.log(`[table ${this.id}] engine.command threw`, e);
      return { ok: false, status: 500, code: "engine-error" };
    }
    if (!res.ok) return res;
    return this.finish(res, now);
  }

  tick(): ExecResult | null {
    if (this.broken) return null;
    const now = this.d.clock();
    let res: CommandResult;
    try {
      res = this.d.engine.tick(this.state, this.ctx(now));
    } catch (e) {
      this.d.log(`[table ${this.id}] engine.tick threw`, e);
      return { ok: false, status: 500, code: "engine-error" };
    }
    if (!res.ok) return res;
    if (res.state === this.state && res.effects.length === 0) return res;
    return this.finish(res, now);
  }

  private lastPlan: Plan | null = null;

  private finish(res: Extract<CommandResult, { ok: true }>, now: number): ExecResult {
    try {
      this.persist(res.state, res.effects, now, this.seq + 1);
    } catch (e) {
      this.d.log(`[table ${this.id}] persistence failed; command rejected, state not advanced`, e);
      if (e instanceof PersistenceError && e.fatal) this.broken = true;
      return { ok: false, status: 503, code: "persistence-failed" };
    }
    const plan = this.lastPlan!;
    this.state = res.state;
    this.seq = plan.seq;
    this.applyMemory(res.effects, plan);
    this.lastTouchedAt = now;
    this.rearm();
    this.deliverEffects(res.effects);
    this.broadcast();
    return res;
  }

  /** Durable part (step 1+2 of ARCH 7). Throws on failure; touches no in-memory state except `lastPlan`. */
  private persist(state: TableState, effects: EngineEffect[], now: number, seq: number): void {
    const log = this.logs.plan(seq, effects);
    const fair = this.fairness.plan(seq, effects);
    const chat: StoredChat[] = [];
    for (const e of effects) if (e.kind === "systemChat") chat.push({ seq, at: now, playerID: null, playerName: SYSTEM_SENDER, message: e.message });
    const doc: StateDoc = { v: 1, seq, savedAtMs: now, state, wake: this.d.engine.nextWakeAt(state) };
    this.lastPlan = { seq, log, fair, chat };
    this.store.commit(
      {
        log: log.map((r) => JSON.stringify(r)),
        fairness: fair.map((r) => FairnessStore.toLine(r)),
        chat: chat.map((r) => JSON.stringify(r))
      },
      JSON.stringify(doc)
    );
  }

  private applyMemory(_effects: EngineEffect[], plan: Plan): void {
    for (const r of plan.log) this.logs.add(r);
    for (const r of plan.fair) this.fairness.add(r);
    for (const m of plan.chat) this.chat.add(m);
    this.pendingChat = plan.chat;
  }
  private pendingChat: StoredChat[] = [];

  private deliverEffects(effects: EngineEffect[]): void {
    for (const e of effects) {
      if (e.kind === "notice") {
        const targets = e.to === "all" ? [...this.subs] : [...this.subs].filter((s) => s.viewer === e.to);
        for (const s of targets) {
          if (e.code === "approved") s.send({ t: "igpu", name: this.d.engine.playerName(this.state, s.viewer) ?? "", mutedIds: this.d.engine.mutedIds(this.state, s.viewer), straddling: this.straddling(s.viewer) });
          else if (e.code === "rejected") continue; // SPEC 2.4: guest gets NO message
          else s.send({ t: "notice", kind: e.code, message: e.message ?? "" });
        }
      }
    }
    for (const m of this.pendingChat) this.broadcastChat(m);
    this.pendingChat = [];
  }

  straddling(id: PlayerId): boolean {
    return !!this.d.engine.frame(this.state, id, this.d.clock()).you?.straddling;
  }

  /** Send a delta to every registered socket whose projection changed. */
  broadcast(): void {
    for (const s of [...this.subs]) if (s.registered) s.pushUpdate(false);
  }
  keepAlive(): void {
    for (const s of [...this.subs]) if (s.registered) s.pushUpdate(true);
  }

  /* ---------------- timers ---------------- */

  rearm(): void {
    if (this.disposed) return;
    const wake = this.d.engine.nextWakeAt(this.state);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.timerFor = wake;
    if (wake === null) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, wake - this.d.clock()));
    this.timer = setTimeout(() => this.onTimer(wake), delay);
    this.timer.unref?.();
  }

  private onTimer(wake: number): void {
    this.timer = null;
    if (this.disposed) return;
    if (this.d.clock() < wake) return this.rearm(); // capped sleep: re-check
    const res = this.tick();
    if (res && !res.ok) {
      this.d.log(`[table ${this.id}] tick failed: ${JSON.stringify(res)}`);
      this.timer = setTimeout(() => this.rearm(), 1000);
      this.timer.unref?.();
      return;
    }
    const next = this.d.engine.nextWakeAt(this.state);
    if (next !== null && next <= this.d.clock() && next === this.timerFor) {
      // no progress: avoid a hot loop
      this.timerFor = next;
      this.timer = setTimeout(() => this.rearm(), 50);
      this.timer.unref?.();
      return;
    }
    this.rearm();
  }

  /* ---------------- presence & sockets ---------------- */

  addSub(s: Subscriber): void {
    this.subs.add(s);
    const n = (this.presence.get(s.viewer) ?? 0) + 1;
    this.presence.set(s.viewer, n);
    if (n === 1) this.exec(s.viewer, { kind: "presence", connected: true });
  }
  removeSub(s: Subscriber): void {
    if (!this.subs.delete(s)) return;
    const n = (this.presence.get(s.viewer) ?? 1) - 1;
    if (n <= 0) {
      this.presence.delete(s.viewer);
      if (!this.disposed) this.exec(s.viewer, { kind: "presence", connected: false });
    } else this.presence.set(s.viewer, n);
  }

  /* ---------------- projection helpers ---------------- */

  project(viewer: PlayerId, now: number): Frame {
    const f = this.d.engine.frame(this.state, viewer, now);
    f.meta.mEV = this.emojiVersion;
    return f;
  }

  /* ---------------- chat ---------------- */

  postChat(sender: PlayerId, text: string): "ok" | "ignored" | "failed" {
    const now = this.d.clock();
    const name = this.d.engine.playerName(this.state, sender);
    if (name === null) return "ignored";
    const message = sanitizeChat(text);
    if (!message) return "ignored";
    const hits = (this.chatHits.get(sender) ?? []).filter((x) => x > now - LIMITS.CHAT_WINDOW_MS);
    hits.push(now); this.chatHits.set(sender, hits);
    if (hits.length > LIMITS.CHAT_PER_WINDOW) return "ignored";
    if (this.chatHits.size > 2000) for (const [k, v] of this.chatHits) if (!v.length || v[v.length - 1]! <= now - LIMITS.CHAT_WINDOW_MS) this.chatHits.delete(k);
    const f = this.d.engine.frame(this.state, null, now);
    if (!f.table.config.guestChat && !this.d.engine.isOwner(this.state, sender)) return "ignored";
    const verdict = this.d.profanity.check(message, sender, now);
    if (!verdict.allow) {
      for (const s of this.subs) if (s.viewer === sender) for (const m of verdict.system ?? []) s.send({ t: "chat", message: { at: now, playerID: null, playerName: SYSTEM_SENDER, message: m, autoMessage: true } satisfies ChatMessage });
      return "ignored";
    }
    const rec: StoredChat = { seq: this.seq, at: now, playerID: sender, playerName: name, message };
    try {
      if (this.chatCount < LIMITS.CHAT_PERSIST_MAX) { this.store.appendChat(JSON.stringify(rec)); this.chatCount++; }
    } catch (e) {
      this.d.log(`[table ${this.id}] chat persist failed`, e);
      return "failed";
    }
    this.chat.add(rec);
    this.broadcastChat(rec);
    return "ok";
  }

  private broadcastChat(m: StoredChat): void {
    const { seq: _s, ...msg } = m;
    for (const s of this.subs) {
      if (!s.registered) continue;
      if (m.playerID && this.d.engine.mutedIds(this.state, s.viewer).includes(m.playerID)) continue;
      s.send({ t: "chat", message: msg });
    }
  }

  chatHistoryFor(viewer: PlayerId): ChatMessage[] {
    const muted = new Set(this.d.engine.mutedIds(this.state, viewer));
    return this.chat.history((id) => muted.has(id));
  }

  /* ---------------- emoji (SPEC 21: nEM / rEM with version counter; transient, not persisted) ---------------- */

  setEmoji(id: PlayerId, emoji: string | null): void {
    if (this.d.engine.playerName(this.state, id) === null) return;
    this.emojiVersion++;
    if (emoji === null) delete this.emojis[id]; else this.emojis[id] = emoji;
    for (const s of this.subs) if (s.registered) s.send({ t: "nEM", version: this.emojiVersion, playerId: id, emoji });
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

interface Plan { seq: number; log: ReturnType<LogStore["plan"]>; fair: ReturnType<FairnessStore["plan"]>; chat: StoredChat[] }
