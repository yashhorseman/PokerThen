import {
  apply, applyRecoveryGrace, bankMs, buildPots, buildTree, Command, Config, DEFAULT_CONFIG, EngineError, EngineEvent, eligibleSeats,
  Hand, HandPlayer, isHandActive, legalActions, MAX_SEATS, mergeConfig, newTable, nextDue, proofFor, rabbitCards, rabbitIndices, RitPref,
  TableState, validateConfig, CardProof,
} from '@pokerthen/engine';
import type {
  ClientCommand, ErrorInfo, FairnessView, HandView, LedgerEntryView, LedgerRow, LogEntryView, PendingView, RequestView, Role, SeatView, Snapshot,
} from '@pokerthen/protocol';
import { PROTOCOL_VERSION, validateNickname } from '@pokerthen/protocol';
import { freshDeck, randomFloat, randomId } from './util';

/* ───────────── state ───────────── */

export interface Member {
  id: string;
  nickname: string;
  joinedAt: number;
  ritPref: RitPref;
  autoBank: boolean;
}
export interface SeatRequest {
  id: string;
  kind: 'seat' | 'topup';
  memberId: string;
  seat?: number;
  amount: number;
  sitOut?: boolean;
  createdAt: number;
}
export interface PendingOp {
  id: string;
  kind: 'adjust' | 'topup';
  memberId: string;
  mode?: 'ADD' | 'REMOVE' | 'SET';
  amount: number;
  reason?: string;
}
export interface LedgerEntry {
  id: number;
  ts: number;
  memberId: string;
  type: 'BUY_IN' | 'TOP_UP' | 'CASH_OUT' | 'HOST_ADJUSTMENT';
  amount: number;
  reason?: string;
  handNo?: number;
}
export interface LogEntry {
  seq: number;
  ts: number;
  kind: 'system' | 'hand' | 'config' | 'admin' | 'chat';
  handNo?: number;
  text: string;
  memberId?: string;
}
export interface RoomState {
  v: 1;
  id: string;
  createdAt: number;
  status: 'OPEN' | 'CLOSED';
  closing: boolean;
  ownerId: string;
  members: Record<string, Member>;
  banned: string[];
  requests: SeatRequest[];
  table: TableState;
  configVersion: number;
  pendingConfig: Partial<Config> | null;
  pendingOps: PendingOp[];
  boundaryHand: number;
  ledger: LedgerEntry[];
  nextLedgerId: number;
  log: LogEntry[];
  logSeq: number;
  version: number;
  rabbit: { handNo: number; viewers: string[] };
  results: Record<string, Array<{ commandId: string; hash: string; ok: boolean; error?: ErrorInfo }>>;
  lastActiveAt: number;
}

export class RoomError extends Error {
  constructor(public code: string, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}
const fail = (code: string, message: string, fieldErrors?: Record<string, string>): never => {
  throw new RoomError(code, message, fieldErrors);
};

export type ExecResult = { ok: true; replay?: boolean } | { ok: false; error: ErrorInfo; replay?: boolean };

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' } as const;
export const fmtCard = (c: string) => `${c[0] === 'T' ? '10' : c[0]}${SUIT[c[1] as keyof typeof SUIT]}`;
const fmtCards = (cs: string[]) => cs.map(fmtCard).join(' ');

/* ───────────── room ───────────── */

export class Room {
  /** live connections: connection id → identity */
  conns = new Map<string, string>();
  private dirty = false;
  private chatTimes = new Map<string, number[]>();
  private treeCache = new Map<string, string[][]>();
  now: () => number;

  constructor(public state: RoomState, now: () => number = () => Date.now()) {
    this.now = now;
  }

  static create(id: string, ownerId: string, nickname: string, now: number = Date.now(), config: Config = DEFAULT_CONFIG): Room {
    const state: RoomState = {
      v: 1, id, createdAt: now, status: 'OPEN', closing: false, ownerId,
      members: { [ownerId]: { id: ownerId, nickname, joinedAt: now, ritPref: 'ask', autoBank: true } },
      banned: [], requests: [], table: newTable(config), configVersion: 1, pendingConfig: null, pendingOps: [], boundaryHand: 0,
      ledger: [], nextLedgerId: 1, log: [], logSeq: 0, version: 1, rabbit: { handNo: 0, viewers: [] }, results: {}, lastActiveAt: now,
    };
    const r = new Room(state);
    r.log('system', `${nickname} created the table.`);
    return r;
  }

  /** Called after loading from disk: nothing becomes overdue until a grace period has passed. */
  recover() {
    applyRecoveryGrace(this.state.table, this.now());
  }

  get t() { return this.state.table; }
  get dirtyFlag() { return this.dirty; }
  clearDirty() { this.dirty = false; }
  touch() { this.state.version++; this.state.lastActiveAt = this.now(); this.dirty = true; }

  isOnline(id: string) {
    for (const x of this.conns.values()) if (x === id) return true;
    return false;
  }

  /* ---- logging & ledger ---- */
  log(kind: LogEntry['kind'], text: string, extra: Partial<LogEntry> = {}) {
    const s = this.state;
    s.log.push({ seq: ++s.logSeq, ts: this.now(), kind, text, handNo: this.t.hand?.no, ...extra });
    if (s.log.length > 600) s.log.splice(0, s.log.length - 600);
  }
  private led(type: LedgerEntry['type'], memberId: string, amount: number, reason?: string) {
    const s = this.state;
    s.ledger.push({ id: s.nextLedgerId++, ts: this.now(), memberId, type, amount, reason, handNo: this.t.hand?.no });
  }
  private nick(id: string) { return this.state.members[id]?.nickname ?? 'Someone'; }
  private seatOf(memberId: string): number { return this.t.seats.findIndex((s) => s && s.memberId === memberId); }
  private nickAtSeat(seat: number): string {
    const h = this.t.hand;
    const hp = h?.players.find((p) => p.seat === seat);
    return hp ? this.nick(hp.memberId) : this.t.seats[seat] ? this.nick(this.t.seats[seat]!.memberId) : `Seat ${seat + 1}`;
  }
  private inActiveHand(memberId: string) {
    const h = this.t.hand;
    return !!h && h.phase !== 'COMPLETE' && h.players.some((p) => p.memberId === memberId);
  }

  /* ---- engine bridge ---- */
  private eng(cmd: Command): EngineEvent[] {
    const r = apply(this.t, cmd, this.now());
    this.state.table = r.state;
    this.onEvents(r.events);
    this.afterEngine();
    return r.events;
  }

  private onEvents(events: EngineEvent[]) {
    const money = (n: number) => String(n);
    for (const e of events) {
      switch (e.type) {
        case 'hand.started': {
          const hs = e as unknown as { no: number; dealerSeat: number; commit: string; players: Array<{ seat: number; memberId: string; stack: number }> };
          this.state.rabbit = { handNo: hs.no, viewers: [] };
          this.log('hand', `— Hand #${hs.no} — dealer: ${this.nick(this.t.seats[hs.dealerSeat]?.memberId ?? '')}. Deck commitment: ${hs.commit.slice(0, 16)}…`, { handNo: hs.no });
          this.log('hand', 'Stacks: ' + hs.players.map((p) => `${this.nick(p.memberId)} (${money(p.stack)})`).join(', '));
          break;
        }
        case 'forcedBet.posted': {
          const kind = e.kind === 'sb' ? 'the small blind' : e.kind === 'bb' ? 'the big blind' : 'an ante';
          this.log('hand', `${this.nickAtSeat(e.seat as number)} posts ${kind} of ${e.amount}${e.allIn ? ' (all-in)' : ''}.`);
          break;
        }
        case 'action.committed': {
          const n = this.nickAtSeat(e.seat as number);
          const tail = e.allIn ? ' and is all-in' : '';
          const a = e.action as string;
          if (a === 'fold') this.log('hand', `${n} folds.`);
          else if (a === 'check') this.log('hand', `${n} checks.`);
          else if (a === 'call') this.log('hand', `${n} calls ${e.added}${tail}.`);
          else if (a === 'bet') this.log('hand', `${n} bets ${e.amount}${tail}.`);
          else this.log('hand', `${n} raises to ${e.amount}${tail}.`);
          break;
        }
        case 'street.dealt': {
          const run = e.run === 2 ? 'Run 2 — ' : (this.t.hand?.runs === 2 ? 'Run 1 — ' : '');
          const street = String(e.street);
          this.log('hand', `${run}${street[0].toUpperCase()}${street.slice(1)}: ${fmtCards(e.board as string[])}`);
          break;
        }
        case 'runout.reveal':
          this.log('hand', 'All-in — hands revealed: ' + (e.hands as Array<{ seat: number; cards: string[] }>).map((h) => `${this.nickAtSeat(h.seat)} [${fmtCards(h.cards)}]`).join(', '));
          break;
        case 'runout.vote': this.log('hand', 'Run it twice? Every player still in the hand must agree (10 seconds).'); break;
        case 'runout.voted': this.log('hand', `${this.nickAtSeat(e.seat as number)} ${e.yes ? 'agrees to run it twice' : 'declines to run it twice'}.`); break;
        case 'runout.decided':
          this.log('hand', e.runs === 2 ? 'Running it twice.' : e.why === 'timeout' ? 'No agreement in time — running it once.' : e.why === 'declined' ? 'Running it once.' : '');
          break;
        case 'uncalled.returned': this.log('hand', `Uncalled bet of ${e.amount} returned to ${this.nickAtSeat(e.seat as number)}.`); break;
        case 'pot.awarded': this.logAwards(e); break;
        case 'cards.shown': this.log('hand', `${this.nickAtSeat(e.seat as number)} shows ${fmtCards(e.cards as string[])}.`); break;
        case 'hand.completed': break;
        case 'player.timedOut': this.log('hand', `${this.nickAtSeat(e.seat as number)} ran out of time and ${e.action === 'check' ? 'checks' : 'folds'} — now sitting out.`); break;
        case 'bank.used': this.log('hand', `${this.nickAtSeat(e.seat as number)} uses the time bank.`); break;
        case 'seat.taken': this.log('system', `${this.nick(e.memberId as string)} sat in seat ${(e.seat as number) + 1} with ${e.stack}${e.sitOut ? ' (sitting out)' : ''}.`); break;
        case 'seat.vacated': {
          const id = e.memberId as string;
          this.led('CASH_OUT', id, e.cashOut as number);
          this.log('system', `${this.nick(id)} left seat ${(e.seat as number) + 1} and cashed out ${e.cashOut}.`);
          const req = this.state.requests.filter((r) => r.memberId === id && r.kind === 'topup');
          if (req.length) this.state.requests = this.state.requests.filter((r) => !req.includes(r));
          break;
        }
        case 'seat.leaving': this.log('system', `${this.nick(e.memberId as string)} will leave their seat after this hand.`); break;
        case 'participation': {
          const who = this.nick(e.memberId as string);
          this.log('system', e.value === 'ACTIVE' ? `${who} is back.` : e.returnOnBB ? `${who} is sitting out until the big blind.` : `${who} is sitting out.`);
          break;
        }
        case 'game.started': this.log('system', 'The host started the game.'); break;
        case 'game.stopped': this.log('system', 'The game has stopped. Seats can be rearranged; starting again picks a random dealer.'); break;
        case 'game.stopScheduled': this.log('system', 'The game will stop after this hand.'); break;
        case 'game.stopCancelled': this.log('system', 'Stop after this hand was cancelled.'); break;
        case 'game.paused': this.log('system', e.handActive ? 'The host paused the game. The clock is frozen.' : 'The host paused the game.'); break;
        case 'game.resumed': this.log('system', 'The game resumed.'); break;
        default: break;
      }
    }
  }

  private logAwards(e: EngineEvent) {
    const h = this.t.hand;
    if (!h) return;
    const res = h.results;
    if (!res) return;
    if (res.uncontested) {
      const w = res.pots[0]?.awards[0]?.winners[0];
      if (w) this.log('hand', `${this.nickAtSeat(w.seat)} wins ${res.pots.reduce((a, p) => a + p.amount, 0)} — everyone else folded.`);
      return;
    }
    const twoRuns = !!h.board2;
    res.pots.forEach((p) => {
      p.awards.forEach((a) => {
        const label = res.pots.length > 1 ? (p.index === 0 ? 'main pot' : `side pot ${p.index}`) : 'pot';
        for (const w of a.winners) this.log('hand', `${this.nickAtSeat(w.seat)} wins ${w.amount} from the ${twoRuns ? `run ${a.run} ` : ''}${label}${w.hand ? ` with ${w.hand}` : ''}.`);
      });
    });
    void e;
  }

  private afterEngine() {
    const h = this.t.hand;
    if (h && h.phase === 'COMPLETE' && this.state.boundaryHand !== h.no) this.processBoundary();
    if (this.state.closing && !isHandActive(this.t)) this.closeNow();
    this.touch();
  }

  /** Transaction order at a hand boundary: settle → queued stack changes → queued rule changes → (engine schedules next hand). */
  private processBoundary() {
    const s = this.state;
    const h = this.t.hand as Hand;
    s.boundaryHand = h.no;
    const ops = s.pendingOps;
    s.pendingOps = [];
    for (const op of ops) {
      try { this.applyStackOp(op); } catch (e) { this.log('admin', `Could not apply a queued change: ${e instanceof Error ? e.message : 'error'}`); }
    }
    if (s.pendingConfig) {
      const merged = mergeConfig(this.t.config, s.pendingConfig);
      s.pendingConfig = null;
      const errs = validateConfig(merged);
      if (Object.keys(errs).length === 0) {
        this.state.table = { ...this.t, config: merged };
        s.configVersion++;
        this.log('config', 'Queued rule changes are now in effect.');
      }
    }
  }

  private applyStackOp(op: PendingOp) {
    const seat = this.seatOf(op.memberId);
    if (seat < 0) return;
    const cur = this.t.seats[seat]!.stack;
    if (op.kind === 'topup') {
      this.eng({ type: 'ADD_CHIPS', seat, amount: op.amount });
      this.led('TOP_UP', op.memberId, op.amount);
      this.log('system', `${this.nick(op.memberId)} added ${op.amount} chips.`);
      return;
    }
    const next = op.mode === 'ADD' ? cur + op.amount : op.mode === 'REMOVE' ? Math.max(0, cur - op.amount) : op.amount;
    this.eng({ type: 'SET_STACK', seat, stack: next });
    if (next !== cur) this.led('HOST_ADJUSTMENT', op.memberId, next - cur, op.reason);
    this.log('admin', `Host ${next >= cur ? 'added' : 'removed'} ${Math.abs(next - cur)} ${next >= cur ? 'to' : 'from'} ${this.nick(op.memberId)}'s stack (${op.reason}). Now ${next}.`);
  }

  private closeNow() {
    const s = this.state;
    if (s.status === 'CLOSED') return;
    this.t.seats.forEach((st, i) => {
      if (st) { const r = apply(this.t, { type: 'LEAVE', seat: i }, this.now()); this.state.table = r.state; this.onEvents(r.events); }
    });
    s.status = 'CLOSED'; s.closing = false;
    this.state.table = { ...this.t, status: 'STOPPED', nextHandAt: null };
    this.log('system', 'The host closed the table. History and the ledger remain readable.');
  }

  /* ───────────── commands ───────────── */

  execute(identityId: string, commandId: string, cmd: ClientCommand): ExecResult {
    const s = this.state;
    const hash = JSON.stringify(cmd);
    const hist = (s.results[identityId] ??= []);
    const prior = hist.find((r) => r.commandId === commandId);
    if (prior) {
      if (prior.hash !== hash) return { ok: false, error: { code: 'COMMAND_ID_REUSED', message: 'That command id was already used for a different request.' } };
      return prior.ok ? { ok: true, replay: true } : { ok: false, error: prior.error as ErrorInfo, replay: true };
    }
    let res: ExecResult;
    try {
      this.run(identityId, cmd);
      res = { ok: true };
    } catch (e) {
      if (e instanceof RoomError) res = { ok: false, error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } };
      else if (e instanceof EngineError) res = { ok: false, error: { code: e.code, message: e.message } };
      else {
        console.error('internal error executing command', cmd.kind, e);
        res = { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong on the server. Your table is refreshing.' } };
      }
    }
    hist.push({ commandId, hash, ok: res.ok, error: res.ok ? undefined : res.error });
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    this.dirty = true; // persist results (dedup) even for rejections
    return res;
  }

  private requireOpen() { if (this.state.status !== 'OPEN') fail('ROOM_CLOSED', 'This table has ended.'); }
  private requireOwner(id: string) { if (id !== this.state.ownerId) fail('PERMISSION_DENIED', 'Only the host can do that.'); }
  private requireSeat(id: string): number {
    const seat = this.seatOf(id);
    if (seat < 0) fail('NOT_SEATED', 'You need to be seated to do that.');
    return seat;
  }

  private run(id: string, cmd: ClientCommand) {
    const s = this.state;
    if (s.status === 'CLOSED' && cmd.kind !== 'chat.send') fail('ROOM_CLOSED', 'This table has ended.');
    switch (cmd.kind) {
      case 'seat.request': return this.seatRequest(id, cmd);
      case 'seat.cancelRequest': {
        const before = s.requests.length;
        s.requests = s.requests.filter((r) => r.memberId !== id);
        if (s.requests.length === before) fail('NO_REQUEST', 'You have no pending request.');
        this.log('system', `${this.nick(id)} cancelled their request.`);
        return this.touch();
      }
      case 'topup.request': return this.topupRequest(id, cmd.amount);
      case 'request.decide': return this.decide(id, cmd);
      case 'seat.leave': {
        const seat = this.requireSeat(id);
        this.eng({ type: 'LEAVE', seat });
        return;
      }
      case 'sit.out': {
        const seat = this.requireSeat(id);
        this.eng({ type: 'SIT_OUT', seat, value: cmd.value, returnOnBB: cmd.returnOnBB });
        return;
      }
      case 'action': {
        const seat = this.requireSeat(id);
        const h = this.t.hand;
        if (!h || h.id !== cmd.handId) fail('STALE_HAND', 'That hand is over. Your table is refreshing.');
        this.eng({ type: 'ACTION', seat, turnId: cmd.turnId, action: cmd.action, raiseTo: cmd.raiseTo });
        return;
      }
      case 'bank.use': {
        const seat = this.requireSeat(id);
        this.eng({ type: 'USE_BANK', seat, turnId: cmd.turnId });
        return;
      }
      case 'show': {
        const seat = this.t.hand?.players.find((p) => p.memberId === id)?.seat;
        if (seat === undefined) fail('NOT_IN_HAND', 'You were not in this hand.');
        this.eng({ type: 'SHOW', seat: seat as number, cards: cmd.cards });
        return;
      }
      case 'rabbit.reveal': return this.rabbitReveal(id);
      case 'runout.vote': {
        const seat = this.requireSeat(id);
        this.eng({ type: 'VOTE', seat, yes: cmd.yes });
        return;
      }
      case 'prefs.set': {
        const m = s.members[id] ?? fail('NOT_A_MEMBER', 'Join the table first.');
        if (cmd.ritPref) m.ritPref = cmd.ritPref;
        if (cmd.autoBank !== undefined) m.autoBank = cmd.autoBank;
        const seat = this.seatOf(id);
        if (seat >= 0) this.eng({ type: 'SET_PREFS', seat, ritPref: cmd.ritPref, autoBank: cmd.autoBank });
        return this.touch();
      }
      case 'chat.send': return this.chat(id, cmd.text);
      default: break;
    }
    // everything below is host-only
    this.requireOwner(id);
    switch (cmd.kind) {
      case 'admin.start': {
        this.eng({ type: 'START_GAME', pick: randomFloat() });
        return;
      }
      case 'admin.nextHand': this.eng({ type: 'NEXT_HAND' }); return;
      case 'admin.pause': this.eng({ type: cmd.value ? 'PAUSE' : 'RESUME' }); return;
      case 'admin.stopAfterHand': this.eng({ type: 'STOP_AFTER_HAND', value: cmd.value }); return;
      case 'admin.config': return this.adminConfig(cmd);
      case 'admin.cancelPending': {
        s.pendingConfig = null;
        this.log('config', 'The host cancelled the queued rule changes.');
        return this.touch();
      }
      case 'admin.adjust': return this.adminAdjust(cmd);
      case 'admin.removePlayer': {
        if (cmd.memberId === s.ownerId) fail('PERMISSION_DENIED', 'The host cannot be removed. Transfer ownership first.');
        const seat = this.seatOf(cmd.memberId);
        s.requests = s.requests.filter((r) => r.memberId !== cmd.memberId);
        if (!s.members[cmd.memberId]) fail('NO_SUCH_MEMBER', 'That player is not at the table.');
        if (!s.banned.includes(cmd.memberId)) s.banned.push(cmd.memberId);
        this.log('admin', `The host removed ${this.nick(cmd.memberId)} from the table.`);
        if (seat >= 0) this.eng({ type: 'LEAVE', seat });
        return this.touch();
      }
      case 'admin.transferOwnership': {
        if (!s.members[cmd.memberId] || s.banned.includes(cmd.memberId)) fail('NO_SUCH_MEMBER', 'Pick someone who is at the table.');
        if (cmd.memberId === id) fail('BAD_REQUEST', 'You already own this table.');
        s.ownerId = cmd.memberId;
        this.log('admin', `${this.nick(id)} transferred ownership to ${this.nick(cmd.memberId)}.`);
        return this.touch();
      }
      case 'admin.closeRoom': {
        s.closing = true;
        this.log('system', isHandActive(this.t) ? 'The table will close after this hand.' : 'The table is closing.');
        if (!isHandActive(this.t)) this.closeNow();
        return this.touch();
      }
    }
  }

  private seatRequest(id: string, cmd: Extract<ClientCommand, { kind: 'seat.request' }>) {
    const s = this.state;
    this.requireOpen();
    if (s.closing) fail('ROOM_CLOSING', 'This table is closing.');
    if (s.banned.includes(id)) fail('BANNED', 'You were removed from this table.');
    const nn = validateNickname(cmd.nickname);
    if (!nn.ok) fail('BAD_NICKNAME', nn.message, { nickname: nn.message });
    const nickname = (nn as { value: string }).value;
    if (Object.values(s.members).some((m) => m.id !== id && m.nickname.toLowerCase() === nickname.toLowerCase()))
      fail('NICKNAME_TAKEN', 'Someone at this table already uses that nickname.', { nickname: 'That nickname is taken at this table.' });
    if (this.seatOf(id) >= 0) fail('ALREADY_SEATED', 'You already have a seat.');
    if (s.requests.some((r) => r.memberId === id)) fail('REQUEST_PENDING', 'You already have a pending request.');
    if (this.t.seats[cmd.seat]) fail('SEAT_TAKEN', 'That seat is taken — pick another.');
    if (s.requests.some((r) => r.kind === 'seat' && r.seat === cmd.seat)) { /* allowed: owner resolves conflicts */ }
    const isOwner = id === s.ownerId;
    const m = (s.members[id] ??= { id, nickname, joinedAt: this.now(), ritPref: 'ask', autoBank: true });
    m.nickname = nickname;
    if (isOwner) {
      this.seatMember(id, cmd.seat, cmd.stack, cmd.sitOut);
      return;
    }
    s.requests.push({ id: randomId(9), kind: 'seat', memberId: id, seat: cmd.seat, amount: cmd.stack, sitOut: cmd.sitOut, createdAt: this.now() });
    this.log('system', `${nickname} requested seat ${cmd.seat + 1} with ${cmd.stack} chips.`);
    this.touch();
  }

  private seatMember(id: string, seat: number, stack: number, sitOut: boolean) {
    this.eng({ type: 'SEAT', seat, memberId: id, stack, sitOut });
    this.led('BUY_IN', id, stack);
    const m = this.state.members[id];
    this.eng({ type: 'SET_PREFS', seat, ritPref: m.ritPref, autoBank: m.autoBank });
  }

  private topupRequest(id: string, amount: number) {
    const s = this.state;
    this.requireOpen();
    this.requireSeat(id);
    if (s.requests.some((r) => r.memberId === id)) fail('REQUEST_PENDING', 'You already have a pending request.');
    if (id === s.ownerId) return this.queueOrApplyTopup(id, amount);
    s.requests.push({ id: randomId(9), kind: 'topup', memberId: id, amount, createdAt: this.now() });
    this.log('system', `${this.nick(id)} asked to add ${amount} chips.`);
    this.touch();
  }

  private queueOrApplyTopup(memberId: string, amount: number) {
    const op: PendingOp = { id: randomId(9), kind: 'topup', memberId, amount };
    if (this.inActiveHand(memberId)) {
      this.state.pendingOps.push(op);
      this.log('system', `${this.nick(memberId)}'s ${amount} chips will be added after this hand.`);
      this.touch();
    } else this.applyStackOp(op);
  }

  private decide(id: string, cmd: Extract<ClientCommand, { kind: 'request.decide' }>) {
    const s = this.state;
    this.requireOwner(id);
    const req = s.requests.find((r) => r.id === cmd.requestId);
    if (!req) fail('NO_REQUEST', 'That request is no longer pending.');
    const r = req as SeatRequest;
    if (!cmd.approve) {
      s.requests = s.requests.filter((x) => x !== r);
      this.log('system', `${this.nick(r.memberId)}'s request was declined.`);
      return this.touch();
    }
    if (r.kind === 'seat') {
      if (this.t.seats[r.seat as number]) fail('SEAT_CONFLICT', 'That seat has just been taken. Ask the player to choose another seat, or decline.');
      if (this.seatOf(r.memberId) >= 0) { s.requests = s.requests.filter((x) => x !== r); return this.touch(); }
      const stack = cmd.stack ?? r.amount;
      this.seatMember(r.memberId, r.seat as number, stack, !!r.sitOut);
      s.requests = s.requests.filter((x) => x !== r);
    } else {
      if (this.seatOf(r.memberId) < 0) { s.requests = s.requests.filter((x) => x !== r); return this.touch(); }
      s.requests = s.requests.filter((x) => x !== r);
      this.queueOrApplyTopup(r.memberId, cmd.stack ?? r.amount);
    }
    this.touch();
  }

  private adminConfig(cmd: Extract<ClientCommand, { kind: 'admin.config' }>) {
    const s = this.state;
    if (cmd.expectedVersion !== s.configVersion) fail('CONFIG_STALE', 'The settings changed since you opened them. Reopen and try again.');
    const base = mergeConfig(this.t.config, s.pendingConfig ?? {});
    const merged = mergeConfig(base, cmd.patch as Partial<Config>);
    const errs = validateConfig(merged);
    if (Object.keys(errs).length) fail('INVALID_CONFIG', 'Some settings are not valid.', errs);
    if (isHandActive(this.t)) {
      s.pendingConfig = { ...(s.pendingConfig ?? {}), ...(cmd.patch as Partial<Config>) };
      this.log('config', 'The host queued rule changes. They apply at the start of the next hand.');
    } else {
      this.eng({ type: 'SET_CONFIG', config: merged });
      s.configVersion++;
      s.pendingConfig = null;
      this.log('config', `The host updated the rules (blinds ${merged.sb}/${merged.bb}${merged.ante ? `, ante ${merged.ante}` : ''}).`);
    }
    this.touch();
  }

  private adminAdjust(cmd: Extract<ClientCommand, { kind: 'admin.adjust' }>) {
    const seat = this.seatOf(cmd.memberId);
    if (seat < 0) fail('NOT_SEATED', 'That player is not seated.');
    const cur = this.t.seats[seat]!.stack;
    if (cmd.mode === 'REMOVE' && cmd.amount > cur) fail('AMOUNT_OUT_OF_RANGE', `They only have ${cur} chips.`);
    if (cmd.mode !== 'SET' && cmd.amount <= 0) fail('AMOUNT_OUT_OF_RANGE', 'Enter a positive amount.');
    const op: PendingOp = { id: randomId(9), kind: 'adjust', memberId: cmd.memberId, mode: cmd.mode, amount: cmd.amount, reason: cmd.reason };
    if (this.inActiveHand(cmd.memberId)) {
      this.state.pendingOps.push(op);
      this.log('admin', `Host queued a stack change for ${this.nick(cmd.memberId)} (${cmd.mode} ${cmd.amount}, ${cmd.reason}) — applies after this hand.`);
      this.touch();
    } else this.applyStackOp(op);
  }

  private rabbitReveal(id: string) {
    const s = this.state;
    if (!this.t.config.rabbit) fail('RABBIT_OFF', 'Rabbit hunting is off at this table.');
    if (this.seatOf(id) < 0) fail('NOT_SEATED', 'Only seated players can use rabbit hunting.');
    if (!rabbitCards(this.t)) fail('RABBIT_UNAVAILABLE', 'There is nothing left to reveal for this hand.');
    if (s.rabbit.handNo !== this.t.hand!.no) s.rabbit = { handNo: this.t.hand!.no, viewers: [] };
    if (!s.rabbit.viewers.includes(id)) {
      s.rabbit.viewers.push(id);
      this.log('hand', `${this.nick(id)} used rabbit hunting.`);
    }
    this.touch();
  }

  private chat(id: string, text: string) {
    const s = this.state;
    const m = s.members[id];
    if (!m) fail('NOT_A_MEMBER', 'Take a seat request first to chat.');
    if (!this.t.config.guestChat && id !== s.ownerId) fail('CHAT_DISABLED', 'The host turned off guest chat.');
    const clean = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
    if (!clean) fail('EMPTY', 'Type a message.');
    const now = this.now();
    const times = (this.chatTimes.get(id) ?? []).filter((x) => now - x < 10_000);
    if (times.length >= 5) {
      const retry = 10_000 - (now - times[0]);
      throw new RoomError('RATE_LIMITED', `You're sending messages too fast. Try again in ${Math.ceil(retry / 1000)}s.`);
    }
    times.push(now);
    this.chatTimes.set(id, times);
    this.log('chat', clean, { memberId: id });
    this.touch();
  }

  /* ───────────── clock ───────────── */

  tick() {
    if (this.state.status !== 'OPEN') return;
    for (let i = 0; i < 8; i++) {
      const due = nextDue(this.t);
      if (!due || due.at > this.now()) return;
      try {
        const h = this.t.hand;
        if (due.kind === 'START_HAND') {
          const { deck, salts } = freshDeck();
          this.eng({ type: 'START_HAND', handId: `${this.t.handNo + 1}-${randomId(6)}`, deck, salts });
        } else if (due.kind === 'TIMEOUT' && h) this.eng({ type: 'TIMEOUT', turnId: h.turnId });
        else if (due.kind === 'VOTE_TIMEOUT') this.eng({ type: 'VOTE_TIMEOUT' });
        else if (due.kind === 'STEP') this.eng({ type: 'STEP' });
      } catch (e) {
        if (due.kind === 'START_HAND') this.t.nextHandAt = null;
        console.error('tick error', due.kind, e instanceof Error ? e.message : e);
        return;
      }
    }
  }

  /* ───────────── projection ───────────── */

  roleOf(id: string): Role {
    const s = this.state;
    if (!s.members[id]) return 'viewer';
    if (id === s.ownerId) return 'owner';
    if (this.seatOf(id) >= 0) return 'player';
    if (s.requests.some((r) => r.memberId === id)) return 'pending';
    return 'observer';
  }

  private levels(h: Hand): string[][] {
    let l = this.treeCache.get(h.id);
    if (!l) {
      if (this.treeCache.size > 5) this.treeCache.clear();
      l = buildTree(h.deck, h.salts);
      this.treeCache.set(h.id, l);
    }
    return l;
  }
  private proofs(h: Hand, idx: number[]): CardProof[] {
    const lv = this.levels(h);
    return [...new Set(idx)].sort((a, b) => a - b).map((i) => proofFor(lv, h.deck, h.salts, i));
  }

  snapshot(id: string): Snapshot {
    const s = this.state, t = this.t, h = t.hand, now = this.now();
    const role = this.roleOf(id);
    const mySeat = this.seatOf(id);
    const member = s.members[id];
    const stage = h && h.phase !== 'COMPLETE';
    const nBoard = h?.board.length ?? 0;

    const seats: SeatView[] = t.seats.map((st, index) => {
      if (!st) return { index, empty: true };
      const hp = h?.players.find((p) => p.seat === index);
      const inHand = !!hp;
      const mine = st.memberId === id;
      let cards: Array<string | null> | undefined;
      if (hp) {
        if (mine) cards = hp.holes.slice();
        else if (hp.shown[0] || hp.shown[1]) cards = hp.holes.map((c, i) => (hp.shown[i] ? c : null));
      }
      return {
        index, empty: false, memberId: st.memberId, nickname: this.nick(st.memberId), stack: hp ? hp.stack : st.stack,
        participation: st.participation, returnOnBB: st.returnOnBB, leaving: st.leaving, connected: this.isOnline(st.memberId),
        inHand, waitingForNextHand: !!stage && !inHand && st.participation === 'ACTIVE' && st.stack > 0,
        folded: hp?.folded, allIn: hp?.allIn, street: hp ? hp.street : 0, lastAction: hp?.lastAction ?? null,
        holeCount: hp && !hp.folded ? 2 : hp && (hp.shown[0] || hp.shown[1]) ? 2 : 0,
        cards, handName: hp && (hp.shown[0] || hp.shown[1]) && h?.phase === 'COMPLETE' ? hp.handName : null,
        isDealer: !!h && h.dealerSeat === index, isSB: !!h && h.sbSeat === index, isBB: !!h && h.bbSeat === index,
        timeBankMs: mine ? st.timeBank : undefined,
      };
    });

    let handView: HandView | null = null;
    let legal = null;
    let fairness: FairnessView | null = null;
    let canShow: Snapshot['canShow'] = null;
    let rabbit: Snapshot['rabbit'] = null;
    let rabbitAvailable = false;
    if (h) {
      const totalPot = h.players.reduce((a, p) => a + p.total, 0);
      const streetSum = h.players.reduce((a, p) => a + p.street, 0);
      const collectedPot = h.phase === 'COMPLETE' ? 0 : totalPot - streetSum;
      const potsRaw = buildPots(h.players.map((p) => ({ seat: p.seat, total: p.total - p.street, folded: p.folded }))).pots;
      const vote = h.phase === 'RUNOUT_VOTE'
        ? {
            deadline: h.voteDeadline as number,
            pendingSeats: h.players.filter((p) => !p.folded && p.vote === null).map((p) => p.seat),
            mine: (() => { const me = h.players.find((p) => p.memberId === id); return !me || me.folded ? ('n/a' as const) : me.vote === null ? ('pending' as const) : me.vote ? ('yes' as const) : ('no' as const); })(),
          }
        : null;
      handView = {
        id: h.id, no: h.no, phase: h.phase, street: nBoard === 0 ? 'preflop' : nBoard === 3 ? 'flop' : nBoard === 4 ? 'turn' : 'river',
        boards: h.board2 ? [h.board, h.board2] : [h.board], collectedPot, totalPot,
        pots: h.phase === 'COMPLETE' ? [] : potsRaw.map((p) => ({ amount: p.amount, eligibleSeats: p.eligible })),
        currentBet: h.currentBet, toActSeat: h.toAct, turnId: h.turnId, deadline: h.deadline, bankActive: h.bankStartedAt !== null,
        dealerSeat: h.dealerSeat, sbSeat: h.sbSeat, bbSeat: h.bbSeat, runs: h.runs, vote, results: h.phase === 'COMPLETE' ? h.results : null,
        rules: { sb: h.rules.sb, bb: h.rules.bb, ante: h.rules.ante },
      };
      if (mySeat >= 0 && h.toAct === mySeat) {
        const lg = legalActions(t, mySeat);
        if (lg) legal = { turnId: lg.turnId, canCheck: lg.canCheck, callAmount: lg.callAmount, callIsAllIn: lg.callIsAllIn, canRaise: lg.canRaise, minRaiseTo: lg.minRaiseTo, maxRaiseTo: lg.maxRaiseTo, allInAmount: lg.allInAmount, isBet: lg.isBet };
      }
      // fairness: proofs for everything that has been made public
      const idx: number[] = [...h.boardIdx, ...h.board2Idx];
      for (const p of h.players) { if (p.shown[0]) idx.push(p.holeIdx[0]); if (p.shown[1]) idx.push(p.holeIdx[1]); }
      if (h.phase === 'COMPLETE') idx.push(...h.burnIdx);
      const me = h.players.find((p) => p.memberId === id);
      const order = [...h.players].sort((a, b) => ((a.seat - h.dealerSeat - 1 + MAX_SEATS * 2) % MAX_SEATS) - ((b.seat - h.dealerSeat - 1 + MAX_SEATS * 2) % MAX_SEATS)).map((p) => p.seat);
      const viewerRabbit = h.phase === 'COMPLETE' && s.rabbit.handNo === h.no && s.rabbit.viewers.includes(id);
      const rIdx = viewerRabbit ? rabbitIndices(t) : null;
      fairness = {
        commit: h.commit, handNo: h.no, playersInDealOrder: order, proofs: this.proofs(h, idx), mine: me ? this.proofs(h, me.holeIdx) : [],
        rabbit: rIdx ? this.proofs(h, rIdx) : [], complete: h.phase === 'COMPLETE',
      };
      if (viewerRabbit) rabbit = { cards: rabbitCards(t) as string[] };
      rabbitAvailable = h.phase === 'COMPLETE' && t.config.rabbit && !!rabbitCards(t) && mySeat >= 0 && !viewerRabbit;
      if (h.phase === 'COMPLETE' && me && me.holes[0]) {
        const c: Array<0 | 1> = [];
        if (!me.shown[0]) c.push(0);
        if (!me.shown[1]) c.push(1);
        if (c.length) canShow = { cards: c };
      }
    }

    // ledger
    const rows: LedgerRow[] = [];
    const ids = [...new Set(s.ledger.map((e) => e.memberId))];
    for (const mid of ids) {
      let buyIn = 0, buyOut = 0;
      for (const e of s.ledger) {
        if (e.memberId !== mid) continue;
        if (e.type === 'BUY_IN' || e.type === 'TOP_UP') buyIn += e.amount;
        else if (e.type === 'CASH_OUT') buyOut += e.amount;
        else if (e.amount >= 0) buyIn += e.amount; else buyOut += -e.amount;
      }
      const seat = this.seatOf(mid);
      const hp = h && h.phase !== 'COMPLETE' ? h.players.find((p) => p.memberId === mid) : undefined;
      const stack = seat >= 0 ? (hp ? hp.stack : t.seats[seat]!.stack) : 0;
      const committed = hp ? hp.total : 0;
      rows.push({ memberId: mid, nickname: this.nick(mid), buyIn, buyOut, stack, committed, net: buyOut + stack + committed - buyIn });
    }
    rows.sort((a, b) => b.net - a.net);

    const requestView = (r: SeatRequest): RequestView => ({ id: r.id, kind: r.kind, memberId: r.memberId, nickname: this.nick(r.memberId), seat: r.seat, amount: r.amount, sitOut: r.sitOut, createdAt: r.createdAt });

    const pending: PendingView[] = [];
    if (s.pendingConfig) pending.push({ id: 'config', kind: 'config', text: 'Rule changes are queued and apply at the start of the next hand.' });
    if (t.stopAfterHand) pending.push({ id: 'stop', kind: 'stop', text: 'The game will stop after this hand.' });
    for (const op of s.pendingOps) {
      if (role === 'owner' || op.memberId === id) pending.push({ id: op.id, kind: op.kind, memberId: op.memberId, text: op.kind === 'topup' ? `${this.nick(op.memberId)}: +${op.amount} chips after this hand.` : `${this.nick(op.memberId)}: ${op.mode} ${op.amount} after this hand (${op.reason}).` });
    }

    const log: LogEntryView[] = s.log.slice(-200).map((e) => ({ seq: e.seq, ts: e.ts, kind: e.kind, handNo: e.handNo, text: e.text, memberId: e.memberId }));

    const myReq = s.requests.find((r) => r.memberId === id);
    return {
      protocolVersion: PROTOCOL_VERSION, roomId: s.id, version: s.version, serverTime: now,
      viewer: { memberId: id, role, nickname: member?.nickname ?? null, ritPref: member?.ritPref ?? 'ask', autoBank: member?.autoBank ?? true, seat: mySeat >= 0 ? mySeat : null, myRequest: myReq ? requestView(myReq) : null },
      room: {
        status: s.status, ownerId: s.ownerId, ownerNickname: this.nick(s.ownerId), gameStatus: t.status, paused: !!t.paused, stopAfterHand: t.stopAfterHand,
        nextHandAt: t.nextHandAt, config: t.config, configVersion: s.configVersion, pendingConfig: s.pendingConfig, handCount: t.handNo, createdAt: s.createdAt,
      },
      seats, hand: handView, legal, fairness, rabbit, rabbitAvailable, canShow,
      requests: role === 'owner' ? s.requests.map(requestView) : [],
      pending,
      members: Object.values(s.members).filter((m) => !s.banned.includes(m.id)).map((m) => ({ id: m.id, nickname: m.nickname, role: this.roleOf(m.id), seat: this.seatOf(m.id) >= 0 ? this.seatOf(m.id) : null, connected: this.isOnline(m.id), short: m.id.slice(0, 5) })),
      ledger: { rows, entries: s.ledger.slice(-400) as LedgerEntryView[], committedLive: !!stage },
      log,
    };
  }

  /** Public metadata for the join page (no private data). */
  meta() {
    const s = this.state;
    return {
      id: s.id, status: s.status, ownerNickname: this.nick(s.ownerId), seated: this.t.seats.filter(Boolean).length,
      sb: this.t.config.sb, bb: this.t.config.bb, gameStatus: this.t.status,
    };
  }

  ledgerCsv(csvCell: (v: string | number) => string): string {
    const s = this.state;
    const rows = [['nickname', 'member_id', 'type', 'amount', 'reason', 'hand', 'time_utc']];
    for (const e of s.ledger) rows.push([this.nick(e.memberId), e.memberId, e.type, String(e.amount), e.reason ?? '', e.handNo ? String(e.handNo) : '', new Date(e.ts).toISOString()]);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  }

  eligibleCount() { return eligibleSeats(this.t).length; }
  bankMsFor() { return bankMs(this.t.config); }
  handPlayers(): HandPlayer[] { return this.t.hand?.players ?? []; }
}
