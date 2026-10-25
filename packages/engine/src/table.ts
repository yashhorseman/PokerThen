import { Card } from './cards';
import { bestHand } from './eval';
import { buildTree, merkleRoot, proofFor, CardProof } from './merkle';
import { buildPots, splitAmount } from './pots';
import {
  ActionKind, Command, Config, DEFAULT_CONFIG, EngineError, EngineEvent, Hand, HandPlayer, HandResults, LegalActions,
  MAX_SEATS, SeatState, TableState,
} from './types';

export const RUNOUT_STEP_MS = 1500;
export const VOTE_MS = 10_000;
export const FOLD_WIN_DELAY_MS = 3000;
export const RECOVERY_GRACE_MS = 10_000;

export function newTable(config: Config = DEFAULT_CONFIG): TableState {
  return {
    config: { ...config },
    seats: Array.from({ length: MAX_SEATS }, () => null),
    dealerSeat: -1,
    handNo: 0,
    hand: null,
    status: 'STOPPED',
    paused: null,
    stopAfterHand: false,
    nextHandAt: null,
    forcedDealerSeat: null,
  };
}

/* ───────────── helpers ───────────── */

function err(code: string, msg: string): never {
  throw new EngineError(code, msg);
}

const hp = (h: Hand, seat: number): HandPlayer | undefined => h.players.find((p) => p.seat === seat);
const live = (h: Hand) => h.players.filter((p) => !p.folded);

/** next seat clockwise after `from` satisfying pred (wraps; `from` itself checked last) */
function seatAfter<T>(items: Array<T | null>, from: number, pred: (x: T, i: number) => boolean): number {
  const n = items.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    const it = items[i];
    if (it !== null && it !== undefined && pred(it, i)) return i;
  }
  return -1;
}

export const isHandActive = (t: TableState) => !!t.hand && t.hand.phase !== 'COMPLETE';
export const bankMs = (c: Config) => c.bankSeconds * 1000;

export function eligibleSeats(t: TableState): number[] {
  const out: number[] = [];
  t.seats.forEach((s, i) => {
    if (s && s.participation === 'ACTIVE' && s.stack > 0) out.push(i);
  });
  return out;
}

export function canRaiseRights(h: Hand, p: HandPlayer): boolean {
  return p.actedLevel === null || h.currentBet - p.actedLevel >= h.minRaise;
}

export function legalActions(t: TableState, seat: number): LegalActions | null {
  const h = t.hand;
  if (!h || h.phase !== 'BETTING' || h.toAct !== seat) return null;
  const p = hp(h, seat);
  if (!p || p.folded || p.allIn) return null;
  const toCall = Math.max(0, h.currentBet - p.street);
  const callAmount = Math.min(toCall, p.stack);
  const maxRaiseTo = p.street + p.stack;
  const canRaise = p.stack > toCall && canRaiseRights(h, p);
  const rawMin = h.fullBetMade ? h.currentBet + h.minRaise : Math.max(h.rules.bb, h.currentBet + 1);
  return {
    seat,
    turnId: h.turnId,
    canFold: true,
    canCheck: toCall === 0,
    callAmount,
    callIsAllIn: toCall > 0 && toCall >= p.stack,
    canRaise,
    minRaiseTo: Math.min(rawMin, maxRaiseTo),
    maxRaiseTo,
    allInAmount: maxRaiseTo,
    isBet: h.currentBet === 0,
  };
}

/** Which engine command (if any) is due at `now`. Paused tables and stopped games have nothing due. */
export function nextDue(t: TableState): { at: number; kind: 'TIMEOUT' | 'VOTE_TIMEOUT' | 'STEP' | 'START_HAND' } | null {
  if (t.paused) return null;
  const h = t.hand;
  if (h && h.phase === 'BETTING' && h.toAct !== null && h.deadline !== null) return { at: h.deadline, kind: 'TIMEOUT' };
  if (h && h.phase === 'RUNOUT_VOTE' && h.voteDeadline !== null) return { at: h.voteDeadline, kind: 'VOTE_TIMEOUT' };
  if (h && h.phase === 'RUNOUT' && h.stepAt !== null) return { at: h.stepAt, kind: 'STEP' };
  if ((!h || h.phase === 'COMPLETE') && t.status === 'RUNNING' && t.nextHandAt !== null && eligibleSeats(t).length >= 2) return { at: t.nextHandAt, kind: 'START_HAND' };
  return null;
}

/** Shift every absolute timestamp by `delta` ms (resume after pause / crash recovery). */
export function shiftTimes(t: TableState, delta: number) {
  const h = t.hand;
  if (h) {
    if (h.deadline !== null) h.deadline += delta;
    if (h.bankStartedAt !== null) h.bankStartedAt += delta;
    if (h.voteDeadline !== null) h.voteDeadline += delta;
    if (h.stepAt !== null) h.stepAt += delta;
  }
  if (t.nextHandAt !== null) t.nextHandAt += delta;
}

/** Crash recovery: nothing due earlier than now+grace. */
export function applyRecoveryGrace(t: TableState, now: number, grace = RECOVERY_GRACE_MS) {
  const h = t.hand;
  const floor = now + grace;
  if (h) {
    if (h.deadline !== null && h.deadline < floor) h.deadline = floor;
    if (h.voteDeadline !== null && h.voteDeadline < floor) h.voteDeadline = floor;
    if (h.stepAt !== null && h.stepAt < floor) h.stepAt = floor;
  }
  if (t.nextHandAt !== null && t.nextHandAt < floor) t.nextHandAt = floor;
}

/* ───────────── main reducer ───────────── */

export interface ApplyResult {
  state: TableState;
  events: EngineEvent[];
}

/** Pure with respect to its inputs: clones the state, applies the command, returns new state + events, or throws EngineError. */
export function apply(prev: TableState, cmd: Command, now: number): ApplyResult {
  const t = structuredClone(prev) as TableState;
  const ev: EngineEvent[] = [];
  const emit = (e: EngineEvent) => ev.push(e);
  const ctx = { t, now, emit };

  if (t.paused && !['RESUME', 'SEAT', 'LEAVE', 'SET_PREFS', 'SIT_OUT', 'SET_CONFIG', 'ADD_CHIPS', 'SET_STACK', 'STOP_AFTER_HAND', 'SHOW'].includes(cmd.type)) {
    err('ROOM_PAUSED', 'The game is paused.');
  }

  switch (cmd.type) {
    case 'SEAT': seatPlayer(ctx, cmd); break;
    case 'LEAVE': leaveSeat(ctx, cmd.seat); break;
    case 'SIT_OUT': setSitOut(ctx, cmd.seat, cmd.value, !!cmd.returnOnBB); break;
    case 'SET_PREFS': {
      const s = needSeat(t, cmd.seat);
      if (cmd.ritPref) s.ritPref = cmd.ritPref;
      if (cmd.autoBank !== undefined) s.autoBank = cmd.autoBank;
      break;
    }
    case 'ADD_CHIPS': {
      const s = needSeat(t, cmd.seat);
      if (seatInHand(t, cmd.seat)) err('IN_HAND', 'Chips can only be added between hands.');
      if (!Number.isSafeInteger(cmd.amount) || cmd.amount <= 0) err('BAD_AMOUNT', 'Amount must be a positive whole number.');
      s.stack += cmd.amount;
      emit({ type: 'stack.added', seat: cmd.seat, memberId: s.memberId, amount: cmd.amount, stack: s.stack });
      break;
    }
    case 'SET_STACK': {
      const s = needSeat(t, cmd.seat);
      if (seatInHand(t, cmd.seat)) err('IN_HAND', 'Stacks can only be set between hands.');
      if (!Number.isSafeInteger(cmd.stack) || cmd.stack < 0) err('BAD_AMOUNT', 'Stack must be a non-negative whole number.');
      const before = s.stack;
      s.stack = cmd.stack;
      emit({ type: 'stack.set', seat: cmd.seat, memberId: s.memberId, before, stack: s.stack });
      break;
    }
    case 'SET_CONFIG':
      if (isHandActive(t)) err('IN_HAND', 'Rules can only change between hands.');
      t.config = { ...cmd.config };
      break;
    case 'START_GAME': {
      if (t.status === 'RUNNING') err('ALREADY_RUNNING', 'The game is already running.');
      const el = eligibleSeats(t);
      if (el.length < 2) err('NOT_ENOUGH_PLAYERS', 'At least two funded, active players are needed.');
      t.status = 'RUNNING';
      t.stopAfterHand = false;
      if (t.handNo > 0) {
        // new game after a hard stop: random dealer, no carried-over button order
        const pick = el[Math.min(el.length - 1, Math.floor(Math.max(0, Math.min(0.999999, cmd.pick)) * el.length))];
        t.forcedDealerSeat = pick;
      }
      t.nextHandAt = now + 500;
      emit({ type: 'game.started' });
      break;
    }
    case 'NEXT_HAND':
      if (t.status !== 'RUNNING') err('NOT_RUNNING', 'The game is not running.');
      if (isHandActive(t)) err('IN_HAND', 'A hand is in progress.');
      if (eligibleSeats(t).length < 2) err('NOT_ENOUGH_PLAYERS', 'At least two funded, active players are needed.');
      t.nextHandAt = now;
      break;
    case 'SHUFFLE_SEATS': {
      if (isHandActive(t)) err('IN_HAND', 'Seats can only be shuffled between hands.');
      if (t.status === 'RUNNING') err('RUNNING', 'Stop the game first — seats can only be shuffled while it is stopped.');
      const occ = t.seats.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
      const ok = cmd.order.length === occ.length && new Set(cmd.order).size === occ.length && cmd.order.every((i) => occ.includes(i));
      if (!ok) err('BAD_ORDER', 'The seat order is not a permutation of the occupied seats.');
      const old = t.seats.slice();
      occ.forEach((i) => { t.seats[i] = null; });
      occ.forEach((from, k) => { t.seats[cmd.order[k]] = old[from]; });
      emit({ type: 'seats.shuffled' });
      break;
    }
    case 'STOP_AFTER_HAND':
      if (t.status !== 'RUNNING') err('NOT_RUNNING', 'The game is not running.');
      if (!isHandActive(t) && cmd.value) {
        stopGame(ctx);
      } else {
        t.stopAfterHand = cmd.value;
        emit({ type: cmd.value ? 'game.stopScheduled' : 'game.stopCancelled' });
      }
      break;
    case 'PAUSE':
      if (t.paused) err('ALREADY_PAUSED', 'Already paused.');
      t.paused = { at: now };
      emit({ type: 'game.paused', handActive: isHandActive(t) });
      break;
    case 'RESUME':
      if (!t.paused) err('NOT_PAUSED', 'Not paused.');
      shiftTimes(t, now - t.paused.at);
      t.paused = null;
      emit({ type: 'game.resumed' });
      break;
    case 'START_HAND': startHand(ctx, cmd); break;
    case 'ACTION': doAction(ctx, cmd); break;
    case 'USE_BANK': useBank(ctx, cmd.seat, cmd.turnId); break;
    case 'TIMEOUT': doTimeout(ctx, cmd.turnId); break;
    case 'VOTE': doVote(ctx, cmd.seat, cmd.yes); break;
    case 'VOTE_TIMEOUT': {
      const h = t.hand;
      if (!h || h.phase !== 'RUNOUT_VOTE') err('NOT_VOTING', 'No vote in progress.');
      if (h!.voteDeadline !== null && now < h!.voteDeadline) err('NOT_DUE', 'Vote deadline has not passed.');
      decideRuns(ctx, 1, 'timeout');
      break;
    }
    case 'STEP': runoutStep(ctx); break;
    case 'SHOW': showCards(ctx, cmd.seat, cmd.cards); break;
    default: err('UNKNOWN_COMMAND', 'Unknown command.');
  }

  schedule(ctx);
  return { state: t, events: ev };
}

type Ctx = { t: TableState; now: number; emit: (e: EngineEvent) => void };

function needSeat(t: TableState, seat: number): SeatState {
  const s = t.seats[seat];
  if (!s) err('NO_SEAT', 'That seat is empty.');
  return s as SeatState;
}
const seatInHand = (t: TableState, seat: number) => {
  const h = t.hand;
  return !!h && h.phase !== 'COMPLETE' && !!hp(h, seat);
};

/** Make sure a next hand gets scheduled when it should. */
function schedule(c: Ctx) {
  const { t, now } = c;
  if (t.paused) return;
  const idle = !t.hand || t.hand.phase === 'COMPLETE';
  if (!idle || t.status !== 'RUNNING') return;
  // people arrived (or topped up) while waiting: start the next hand shortly
  if (t.nextHandAt === null && t.config.autoStartNext && !t.stopAfterHand && eligibleSeats(t).length >= 2) t.nextHandAt = now + 2000;
}

function stopGame(c: Ctx) {
  c.t.status = 'STOPPED';
  c.t.stopAfterHand = false;
  c.t.nextHandAt = null;
  c.emit({ type: 'game.stopped' });
}

/* ───────────── seating ───────────── */

function seatPlayer(c: Ctx, cmd: Extract<Command, { type: 'SEAT' }>) {
  const { t } = c;
  if (!(cmd.seat >= 0 && cmd.seat < MAX_SEATS)) err('BAD_SEAT', 'No such seat.');
  if (t.seats[cmd.seat]) err('SEAT_TAKEN', 'That seat is taken.');
  if (t.seats.some((s) => s && s.memberId === cmd.memberId)) err('ALREADY_SEATED', 'You already have a seat.');
  if (!Number.isSafeInteger(cmd.stack) || cmd.stack <= 0) err('BAD_AMOUNT', 'Stack must be a positive whole number.');
  t.seats[cmd.seat] = {
    memberId: cmd.memberId, stack: cmd.stack, participation: cmd.sitOut ? 'SITTING_OUT' : 'ACTIVE', leaving: false, returnOnBB: false,
    timeBank: bankMs(t.config), handsSinceRefill: 0, ritPref: 'ask', autoBank: true,
  };
  c.emit({ type: 'seat.taken', seat: cmd.seat, memberId: cmd.memberId, stack: cmd.stack, sitOut: cmd.sitOut });
}

function vacate(c: Ctx, seat: number) {
  const s = c.t.seats[seat];
  if (!s) return;
  c.emit({ type: 'seat.vacated', seat, memberId: s.memberId, cashOut: s.stack });
  c.t.seats[seat] = null;
}

function leaveSeat(c: Ctx, seat: number) {
  const { t } = c;
  const s = needSeat(t, seat);
  const h = t.hand;
  const p = h && h.phase !== 'COMPLETE' ? hp(h, seat) : undefined;
  if (!p) { vacate(c, seat); return; }
  s.leaving = true;
  c.emit({ type: 'seat.leaving', seat, memberId: s.memberId });
  // All-in players keep contesting the pot; the seat is cashed out when the hand settles.
  if (h && h.phase === 'BETTING' && !p.folded && !p.allIn) {
    // outstanding action: check if free, otherwise fold
    if (h.toAct === seat) {
      if (p.street >= h.currentBet) applyCheck(c, h, p);
      else forceFold(c, h, p);
      h.ptr = seat; h.toAct = null; h.deadline = null;
    } else forceFold(c, h, p);
    afterAction(c, h);
  }
}

function setSitOut(c: Ctx, seat: number, value: boolean, returnOnBB: boolean) {
  const s = needSeat(c.t, seat);
  s.participation = value ? 'SITTING_OUT' : 'ACTIVE';
  s.returnOnBB = value && returnOnBB;
  c.emit({ type: 'participation', seat, memberId: s.memberId, value: s.participation, returnOnBB: s.returnOnBB });
}

/* ───────────── starting a hand ───────────── */

function startHand(c: Ctx, cmd: Extract<Command, { type: 'START_HAND' }>) {
  const { t, now } = c;
  if (t.status !== 'RUNNING') err('NOT_RUNNING', 'The game is not running.');
  if (isHandActive(t)) err('IN_HAND', 'A hand is already in progress.');
  if (cmd.deck.length !== 52 || new Set(cmd.deck).size !== 52 || cmd.salts.length !== 52) err('BAD_DECK', 'Deck must be 52 unique cards with 52 salts.');

  // "return on big blind": a sitting-out player rejoins when the big blind would reach them
  const baseRing = eligibleSeats(t);
  const candidates: number[] = [];
  t.seats.forEach((s, i) => { if (s && s.returnOnBB && s.stack > 0) candidates.push(i); });
  const ringWith = (extra: number[]) => [...baseRing, ...extra].sort((a, b) => a - b);

  const pickPositions = (ring: number[]) => {
    const rs = ring;
    const fromSeat = t.dealerSeat;
    const arr: Array<number | null> = Array.from({ length: MAX_SEATS }, (_, i) => (rs.includes(i) ? i : null));
    const forced = t.forcedDealerSeat !== null && rs.includes(t.forcedDealerSeat) ? t.forcedDealerSeat : null;
    const dealer = forced !== null ? forced : seatAfter(arr, forced === null ? t.dealerSeat : fromSeat, () => true);
    const hu = rs.length === 2;
    const sb = hu ? dealer : seatAfter(arr, dealer, () => true);
    const bb = seatAfter(arr, sb, () => true);
    return { dealer, sb, bb };
  };

  let ring = ringWith([]);
  if (candidates.length && ring.length >= 1) {
    const withAll = ringWith(candidates);
    if (withAll.length >= 2) {
      const pos = pickPositions(withAll);
      if (candidates.includes(pos.bb)) {
        ring = ringWith([pos.bb]);
        const s = t.seats[pos.bb] as SeatState;
        s.participation = 'ACTIVE'; s.returnOnBB = false;
        c.emit({ type: 'participation', seat: pos.bb, memberId: s.memberId, value: 'ACTIVE', returnOnBB: false });
      }
    }
  }
  if (ring.length < 2) err('NOT_ENOUGH_PLAYERS', 'At least two funded, active players are needed.');

  const { dealer, sb, bb } = pickPositions(ring);
  t.forcedDealerSeat = null;
  t.dealerSeat = dealer;
  t.handNo++;
  t.nextHandAt = null;

  const tree = buildTree(cmd.deck, cmd.salts);
  const commit = tree[tree.length - 1][0];
  const rules = { ...t.config };
  const players: HandPlayer[] = ring.map((seat) => {
    const s = t.seats[seat] as SeatState;
    return {
      seat, memberId: s.memberId, startStack: s.stack, stack: s.stack, street: 0, total: 0, folded: false, allIn: false, acted: false,
      actedLevel: null, holes: ['', ''] as unknown as [Card, Card], holeIdx: [0, 0], shown: [false, false], vote: null, lastAction: null, handName: null,
    };
  });

  const h: Hand = {
    id: cmd.handId, no: t.handNo, phase: 'BETTING', rules, dealerSeat: dealer, sbSeat: sb, bbSeat: bb, players, deck: cmd.deck, salts: cmd.salts,
    commit, cursor: 0, board: [], boardIdx: [], board2: null, board2Idx: [], burnIdx: [], currentBet: rules.bb, minRaise: rules.bb, fullBetMade: true,
    lastAggressor: null, lastAggressorForShow: null, ptr: bb, toAct: null, turnId: 0, deadline: null, bankStartedAt: null, voteDeadline: null, stepAt: null, runs: 1, split: 0, results: null,
  };
  t.hand = h;

  c.emit({
    type: 'hand.started', handId: h.id, no: h.no, dealerSeat: dealer, sbSeat: sb, bbSeat: bb, commit,
    players: players.map((p) => ({ seat: p.seat, memberId: p.memberId, stack: p.stack })),
  });

  // antes, then blinds (short forced bets simply put the player all-in)
  if (rules.ante > 0) {
    for (const p of players) {
      const a = Math.min(rules.ante, p.stack);
      p.stack -= a; p.total += a;
      if (p.stack === 0) p.allIn = true;
      c.emit({ type: 'forcedBet.posted', seat: p.seat, kind: 'ante', amount: a, allIn: p.allIn });
    }
  }
  const postBlind = (seat: number, amt: number, kind: 'sb' | 'bb') => {
    const p = hp(h, seat) as HandPlayer;
    const a = Math.min(amt, p.stack);
    p.stack -= a; p.street += a; p.total += a;
    if (p.stack === 0) p.allIn = true;
    c.emit({ type: 'forcedBet.posted', seat, kind, amount: a, allIn: p.allIn });
  };
  postBlind(sb, rules.sb, 'sb');
  postBlind(bb, rules.bb, 'bb');

  // hole cards: two rounds, starting left of the dealer. Player k gets deck[k] and deck[n + k].
  const arr: Array<number | null> = Array.from({ length: MAX_SEATS }, (_, i) => (ring.includes(i) ? i : null));
  const order: number[] = [];
  let cur = dealer;
  for (let k = 0; k < ring.length; k++) { cur = seatAfter(arr, cur, () => true); order.push(cur); }
  const n = order.length;
  order.forEach((seat, k) => {
    const p = hp(h, seat) as HandPlayer;
    p.holes = [h.deck[k], h.deck[n + k]];
    p.holeIdx = [k, n + k];
  });
  h.cursor = 2 * n;

  afterAction(c, h);
}

/* ───────────── betting ───────────── */

function setTurn(c: Ctx, h: Hand, seat: number) {
  h.toAct = seat;
  h.turnId++;
  h.bankStartedAt = null;
  h.deadline = h.rules.actionSeconds === null ? null : c.now + h.rules.actionSeconds * 1000;
}

function afterAction(c: Ctx, h: Hand) {
  if (h.phase === 'COMPLETE') return;
  const lv = live(h);
  if (lv.length === 1) { settle(c, h); return; }
  const active = lv.filter((p) => !p.allIn);
  const need = active.filter((p) => !p.acted || p.street < h.currentBet);
  const done = active.length === 0 || (active.length === 1 && active[0].street >= h.currentBet) || need.length === 0;
  if (done) { endStreet(c, h); return; }
  // next player after the pointer who still needs to act
  const arr: Array<HandPlayer | null> = Array.from({ length: MAX_SEATS }, () => null);
  for (const p of need) arr[p.seat] = p;
  const next = seatAfter(arr, h.ptr, () => true);
  if (h.toAct !== next) setTurn(c, h, next);
}

function endStreet(c: Ctx, h: Hand) {
  for (const p of h.players) { p.street = 0; p.acted = false; p.actedLevel = null; if (!p.folded) p.lastAction = null; }
  h.currentBet = 0; h.minRaise = h.rules.bb; h.fullBetMade = false;
  h.toAct = null; h.deadline = null; h.bankStartedAt = null;
  const lastAggr = h.lastAggressor;
  h.lastAggressor = null;
  h.lastAggressorForShow = lastAggr;
  if (h.board.length === 5) { showdown(c, h); return; }
  const active = live(h).filter((p) => !p.allIn);
  if (active.length <= 1) { startRunout(c, h); return; }
  dealStreet(c, h, h.board, h.boardIdx, 1);
  h.ptr = h.dealerSeat;
  afterAction(c, h);
}

const STREET = ['', '', '', 'flop', 'turn', 'river'];
function dealStreet(c: Ctx, h: Hand, board: Card[], idxs: number[], run: number) {
  const n = board.length === 0 ? 3 : 1;
  h.burnIdx.push(h.cursor++);
  const cards: Card[] = [];
  for (let i = 0; i < n; i++) { idxs.push(h.cursor); const card = h.deck[h.cursor++]; board.push(card); cards.push(card); }
  c.emit({ type: 'street.dealt', street: STREET[board.length], run, cards, board: board.slice() });
}

function applyCheck(c: Ctx, h: Hand, p: HandPlayer) {
  p.acted = true; p.actedLevel = h.currentBet; p.lastAction = 'check';
  c.emit({ type: 'action.committed', seat: p.seat, action: 'check', amount: p.street, added: 0, allIn: false });
}
function forceFold(c: Ctx, h: Hand, p: HandPlayer) {
  p.folded = true; p.lastAction = 'fold';
  c.emit({ type: 'action.committed', seat: p.seat, action: 'fold', amount: p.street, added: 0, allIn: false });
  if (h.toAct === p.seat) { h.ptr = p.seat; h.toAct = null; }
}

function settleBank(c: Ctx, h: Hand, seat: number) {
  const s = c.t.seats[seat];
  if (!s || h.bankStartedAt === null) return;
  const used = Math.max(0, Math.min(s.timeBank, c.now - h.bankStartedAt));
  s.timeBank -= used;
  h.bankStartedAt = null;
}

function doAction(c: Ctx, cmd: Extract<Command, { type: 'ACTION' }>) {
  const { t, now } = c;
  const h = t.hand;
  if (!h || h.phase !== 'BETTING') err('NO_ACTION', 'There is nothing to act on right now.');
  const hand = h as Hand;
  if (hand.toAct !== cmd.seat) err('NOT_YOUR_TURN', "It isn't your turn.");
  if (cmd.turnId !== hand.turnId) err('STALE_TURN', 'That action is out of date. Your table is refreshing.');
  const p = hp(hand, cmd.seat) as HandPlayer;
  const lg = legalActions(t, cmd.seat) as LegalActions;
  settleBank(c, hand, cmd.seat);
  void now;

  let action: ActionKind = cmd.action;
  let target = cmd.raiseTo;
  if (action === 'allin') {
    if (lg.callIsAllIn) action = 'call';
    else if (lg.canRaise) { action = 'raise'; target = lg.maxRaiseTo; }
    else err('NOT_REOPENED', 'The betting was not reopened — you can only call or fold.');
  }
  const toCall = hand.currentBet - p.street;

  switch (action) {
    case 'fold':
      forceFold(c, hand, p);
      break;
    case 'check':
      if (toCall > 0) err('ILLEGAL_ACTION', 'You cannot check — call or fold.');
      applyCheck(c, hand, p);
      break;
    case 'call': {
      if (toCall <= 0) { applyCheck(c, hand, p); break; }
      const add = Math.min(toCall, p.stack);
      p.stack -= add; p.street += add; p.total += add;
      if (p.stack === 0) p.allIn = true;
      p.acted = true; p.actedLevel = hand.currentBet; p.lastAction = 'call';
      c.emit({ type: 'action.committed', seat: p.seat, action: 'call', amount: p.street, added: add, allIn: p.allIn });
      break;
    }
    case 'raise': {
      if (!lg.canRaise) err('NOT_REOPENED', p.stack <= toCall ? 'You can only call or fold.' : 'The betting was not reopened — you can only call or fold.');
      if (typeof target !== 'number' || !Number.isSafeInteger(target)) err('AMOUNT_OUT_OF_RANGE', 'Enter a whole number.');
      if (target > lg.maxRaiseTo) err('AMOUNT_OUT_OF_RANGE', `You only have ${lg.maxRaiseTo} to commit this street.`);
      if (target < lg.minRaiseTo) err('AMOUNT_OUT_OF_RANGE', `The minimum ${lg.isBet ? 'bet' : 'raise'} is to ${lg.minRaiseTo}.`);
      const prevBet = hand.currentBet;
      const add = target - p.street;
      p.stack -= add; p.street = target; p.total += add;
      if (p.stack === 0) p.allIn = true;
      const inc = target - prevBet;
      if (!hand.fullBetMade) {
        if (target >= hand.rules.bb) { hand.fullBetMade = true; hand.minRaise = Math.max(hand.rules.bb, inc); }
      } else if (inc >= hand.minRaise) hand.minRaise = inc;
      hand.currentBet = target;
      hand.lastAggressor = p.seat;
      p.acted = true; p.actedLevel = target; p.lastAction = prevBet === 0 ? 'bet' : 'raise';
      c.emit({ type: 'action.committed', seat: p.seat, action: prevBet === 0 ? 'bet' : 'raise', amount: target, added: add, allIn: p.allIn });
      break;
    }
    default:
      err('UNKNOWN_ACTION', 'Unknown action.');
  }
  hand.ptr = p.seat; hand.toAct = null; hand.deadline = null;
  afterAction(c, hand);
}

function useBank(c: Ctx, seat: number, turnId: number) {
  const { t } = c;
  const h = t.hand;
  if (!h || h.phase !== 'BETTING' || h.toAct !== seat) err('NOT_YOUR_TURN', "It isn't your turn.");
  if (turnId !== (h as Hand).turnId) err('STALE_TURN', 'That action is out of date.');
  const hand = h as Hand;
  const s = needSeat(t, seat);
  if (hand.deadline === null) err('NO_TIMER', 'There is no decision limit.');
  if (hand.bankStartedAt !== null || s.timeBank <= 0) err('NO_BANK', 'No time bank available.');
  hand.bankStartedAt = hand.deadline as number;
  hand.deadline = (hand.deadline as number) + s.timeBank;
  c.emit({ type: 'bank.used', seat, ms: s.timeBank });
}

function doTimeout(c: Ctx, turnId: number) {
  const { t, now } = c;
  const h = t.hand;
  if (!h || h.phase !== 'BETTING' || h.toAct === null) err('NO_TIMER', 'No timer running.');
  const hand = h as Hand;
  if (turnId !== hand.turnId) err('STALE_TURN', 'Stale timer.');
  if (hand.deadline === null || now < hand.deadline) err('NOT_DUE', 'Deadline has not passed.');
  const seat = hand.toAct as number;
  const s = needSeat(t, seat);
  const p = hp(hand, seat) as HandPlayer;
  if (hand.rules.bankSeconds > 0 && s.autoBank && s.timeBank > 0 && hand.bankStartedAt === null) {
    hand.bankStartedAt = now;
    hand.deadline = now + s.timeBank;
    c.emit({ type: 'bank.used', seat, ms: s.timeBank, auto: true });
    return;
  }
  if (hand.bankStartedAt !== null) { s.timeBank = 0; hand.bankStartedAt = null; }
  s.participation = 'SITTING_OUT';
  const free = p.street >= hand.currentBet;
  c.emit({ type: 'player.timedOut', seat, memberId: s.memberId, action: free ? 'check' : 'fold' });
  if (free) applyCheck(c, hand, p); else forceFold(c, hand, p);
  hand.ptr = seat; hand.toAct = null; hand.deadline = null;
  afterAction(c, hand);
}

/* ───────────── runout (all-in), run twice ───────────── */

function startRunout(c: Ctx, h: Hand) {
  const lv = live(h);
  if (h.rules.revealWhenNoAction) {
    for (const p of lv) p.shown = [true, true];
    c.emit({ type: 'runout.reveal', hands: lv.map((p) => ({ seat: p.seat, cards: p.holes })) });
  }
  h.toAct = null; h.deadline = null;
  h.split = h.board.length;
  const mode = h.rules.runTwice;
  if (mode === 'off' || h.board.length >= 5 || lv.length < 2 || !capacityForSecondRun(h)) { decideRuns(c, 1, mode === 'off' ? 'off' : 'capacity'); return; }
  if (mode === 'always') { decideRuns(c, 2, 'always'); return; }
  // ask: personal preferences first
  for (const p of lv) {
    const pref = c.t.seats[p.seat]?.ritPref ?? 'ask';
    p.vote = pref === 'yes' ? true : pref === 'no' ? false : null;
  }
  if (lv.some((p) => p.vote === false)) { decideRuns(c, 1, 'declined'); return; }
  if (lv.every((p) => p.vote === true)) { decideRuns(c, 2, 'agreed'); return; }
  h.phase = 'RUNOUT_VOTE';
  h.voteDeadline = c.now + VOTE_MS;
  c.emit({ type: 'runout.vote', deadline: h.voteDeadline, pending: lv.filter((p) => p.vote === null).map((p) => p.seat) });
}

function capacityForSecondRun(h: Hand): boolean {
  // remaining cards needed for run 1 + run 2 (burn + cards per remaining street, twice)
  let need = 0;
  let len = h.board.length;
  while (len < 5) { need += 1 + (len === 0 ? 3 : 1); len += len === 0 ? 3 : 1; }
  return h.deck.length - h.cursor >= need * 2;
}

function decideRuns(c: Ctx, runs: 1 | 2, why: string) {
  const h = c.t.hand as Hand;
  h.runs = runs;
  h.phase = 'RUNOUT';
  h.voteDeadline = null;
  h.stepAt = c.now + RUNOUT_STEP_MS;
  c.emit({ type: 'runout.decided', runs, why });
}

function doVote(c: Ctx, seat: number, yes: boolean) {
  const h = c.t.hand;
  if (!h || h.phase !== 'RUNOUT_VOTE') err('NOT_VOTING', 'There is no vote right now.');
  const p = hp(h as Hand, seat);
  if (!p || p.folded) err('NOT_ELIGIBLE', 'You are not in this hand.');
  if ((p as HandPlayer).vote !== null) err('ALREADY_VOTED', 'You already voted.');
  (p as HandPlayer).vote = yes;
  c.emit({ type: 'runout.voted', seat, yes });
  const lv = live(h as Hand);
  if (lv.some((x) => x.vote === false)) decideRuns(c, 1, 'declined');
  else if (lv.every((x) => x.vote === true)) decideRuns(c, 2, 'agreed');
}

function runoutStep(c: Ctx) {
  const { t, now } = c;
  const h = t.hand;
  if (!h || h.phase !== 'RUNOUT') err('NO_RUNOUT', 'No runout in progress.');
  const hand = h as Hand;
  if (hand.stepAt !== null && now < hand.stepAt) err('NOT_DUE', 'Not yet.');
  hand.stepAt = now + RUNOUT_STEP_MS;
  if (hand.board.length < 5) {
    dealStreet(c, hand, hand.board, hand.boardIdx, 1);
  } else if (hand.runs === 2) {
    if (!hand.board2) {
      hand.board2 = hand.board.slice(0, hand.split);
      hand.board2Idx = hand.boardIdx.slice(0, hand.split);
      if (hand.board2.length === 5) { showdown(c, hand); return; }
      dealStreet(c, hand, hand.board2, hand.board2Idx, 2);
    } else if (hand.board2.length < 5) {
      dealStreet(c, hand, hand.board2, hand.board2Idx, 2);
    } else { showdown(c, hand); return; }
    if (hand.board2.length === 5 && hand.board.length === 5) { /* next STEP triggers showdown */ }
  } else { showdown(c, hand); return; }
}

/* ───────────── settlement ───────────── */

function settle(c: Ctx, h: Hand) {
  // everyone else folded
  const winner = live(h)[0];
  const { refund, pots } = buildPots(h.players.map((p) => ({ seat: p.seat, total: p.total, folded: p.folded })));
  const results: HandResults = { refund, pots: [], shownSeats: [], uncontested: true };
  if (refund) refundTo(c, h, refund);
  const total = pots.reduce((a, p) => a + p.amount, 0);
  winner.stack += total;
  results.pots = pots.map((p, i) => ({
    index: i, amount: p.amount, eligible: p.eligible,
    awards: [{ run: 1, amount: p.amount, winners: [{ seat: winner.seat, amount: p.amount, hand: null }] }],
  }));
  c.emit({ type: 'pot.awarded', uncontested: true, winnerSeat: winner.seat, amount: total, pots: results.pots });
  h.results = results;
  finish(c, h, false);
}

function refundTo(c: Ctx, h: Hand, refund: { seat: number; amount: number }) {
  const p = hp(h, refund.seat) as HandPlayer;
  p.stack += refund.amount;
  p.total -= refund.amount;
  c.emit({ type: 'uncalled.returned', seat: refund.seat, amount: refund.amount });
}

function showdown(c: Ctx, h: Hand) {
  const lv = live(h);
  const boards = h.board2 ? [h.board, h.board2] : [h.board];
  const { refund, pots } = buildPots(h.players.map((p) => ({ seat: p.seat, total: p.total, folded: p.folded })));
  if (refund) refundTo(c, h, refund);

  const score = new Map<string, number>(); // `${seat}:${board}`
  const nameOf = new Map<string, string>();
  for (const p of lv) {
    boards.forEach((b, bi) => {
      const v = bestHand([...p.holes, ...b]);
      score.set(`${p.seat}:${bi}`, v.score);
      nameOf.set(`${p.seat}:${bi}`, v.name);
    });
    p.handName = boards.map((_, bi) => nameOf.get(`${p.seat}:${bi}`)).filter((x, i, a) => a.indexOf(x) === i).join(' / ');
  }

  const dist = (seat: number) => (seat - h.dealerSeat + MAX_SEATS) % MAX_SEATS;
  const potResults = [] as HandResults['pots'];
  const winnersAny = new Set<number>();
  pots.forEach((pot, pi) => {
    const awards: HandResults['pots'][number]['awards'] = [];
    boards.forEach((_, bi) => {
      const amt = boards.length === 2 ? (bi === 0 ? Math.ceil(pot.amount / 2) : Math.floor(pot.amount / 2)) : pot.amount;
      if (amt <= 0) return;
      const top = Math.max(...pot.eligible.map((s) => score.get(`${s}:${bi}`) as number));
      const ws = pot.eligible.filter((s) => score.get(`${s}:${bi}`) === top).sort((a, b) => dist(a) - dist(b));
      const split = splitAmount(amt, ws);
      for (const w of split) { (hp(h, w.seat) as HandPlayer).stack += w.amount; winnersAny.add(w.seat); }
      awards.push({ run: bi + 1, amount: amt, winners: split.map((w) => ({ seat: w.seat, amount: w.amount, hand: nameOf.get(`${w.seat}:${bi}`) ?? null })) });
    });
    potResults.push({ index: pi, amount: pot.amount, eligible: pot.eligible, awards });
  });

  // who shows: winners always; otherwise standard order — last aggressor first, a hand is shown only if it can beat or tie the best so far
  const shownSeats = new Set<number>();
  const alreadyShown = lv.filter((p) => p.shown[0] && p.shown[1]).map((p) => p.seat);
  alreadyShown.forEach((s) => shownSeats.add(s));
  winnersAny.forEach((s) => shownSeats.add(s));
  const startSeat = h.lastAggressorForShow !== null && h.lastAggressorForShow !== undefined && !hp(h, h.lastAggressorForShow)?.folded
    ? (h.lastAggressorForShow as number) - 1 : h.dealerSeat;
  const arr: Array<HandPlayer | null> = Array.from({ length: MAX_SEATS }, () => null);
  lv.forEach((p) => { arr[p.seat] = p; });
  let cur = startSeat;
  let best = -1;
  for (let k = 0; k < lv.length; k++) {
    cur = seatAfter(arr, cur, () => true);
    const s = Math.max(...boards.map((_, bi) => score.get(`${cur}:${bi}`) as number));
    if (s >= best) { shownSeats.add(cur); best = s; }
  }
  for (const s of shownSeats) {
    const p = hp(h, s) as HandPlayer;
    if (!p.shown[0] || !p.shown[1]) { p.shown = [true, true]; c.emit({ type: 'cards.shown', seat: s, cards: p.holes, auto: true }); }
  }

  const results: HandResults = { refund, pots: potResults, shownSeats: [...shownSeats], uncontested: false };
  h.results = results;
  c.emit({ type: 'pot.awarded', uncontested: false, pots: potResults, boards });
  finish(c, h, true);
}

function showCards(c: Ctx, seat: number, cards: number[]) {
  const h = c.t.hand;
  if (!h || h.phase !== 'COMPLETE') err('NOT_COMPLETE', 'Cards can be shown once the hand is over.');
  const p = hp(h as Hand, seat);
  if (!p) err('NOT_IN_HAND', 'You were not in this hand.');
  const pl = p as HandPlayer;
  const fresh = cards.filter((i) => (i === 0 || i === 1) && !pl.shown[i]);
  if (!fresh.length) return;
  fresh.forEach((i) => { pl.shown[i] = true; });
  c.emit({ type: 'cards.shown', seat, cards: fresh.map((i) => pl.holes[i]), indices: fresh });
}

function finish(c: Ctx, h: Hand, showdownReached: boolean) {
  const { t, now } = c;
  h.phase = 'COMPLETE';
  h.toAct = null; h.deadline = null; h.stepAt = null; h.voteDeadline = null; h.bankStartedAt = null;
  // write results back to seats
  for (const p of h.players) {
    const s = t.seats[p.seat];
    if (!s) continue;
    s.stack = p.stack;
    s.handsSinceRefill++;
    if (s.handsSinceRefill >= h.rules.bankRefillHands) { s.timeBank = bankMs(h.rules); s.handsSinceRefill = 0; }
    p.street = 0;
  }
  c.emit({ type: 'hand.completed', handId: h.id, no: h.no, showdown: showdownReached });
  // leaving players cash out now that the hand is settled
  t.seats.forEach((s, i) => { if (s && s.leaving) vacate(c, i); });
  // next hand / stop
  if (t.stopAfterHand) { stopGame(c); return; }
  if (t.status === 'RUNNING' && t.config.autoStartNext && eligibleSeats(t).length >= 2) {
    t.nextHandAt = now + (showdownReached ? t.config.showdownMs : Math.min(t.config.showdownMs, FOLD_WIN_DELAY_MS));
  } else t.nextHandAt = null;
}

/* ───────────── rabbit hunting ───────────── */

/** Undealt board cards (in order) that would have followed an early-ending hand. Never changes results. */
export function rabbitCards(t: TableState): Card[] | null {
  const h = t.hand;
  if (!h || h.phase !== 'COMPLETE' || h.board.length >= 5 || h.runs === 2) return null;
  const board = h.board.slice();
  let cursor = h.cursor;
  const out: Card[] = [];
  while (board.length < 5) {
    cursor++; // burn
    const n = board.length === 0 ? 3 : 1;
    for (let i = 0; i < n; i++) { const card = h.deck[cursor++]; board.push(card); out.push(card); }
  }
  return out;
}

/** Deck indices of the rabbit cards (for proofs). */
export function rabbitIndices(t: TableState): number[] | null {
  const h = t.hand;
  if (!h || h.phase !== 'COMPLETE' || h.board.length >= 5 || h.runs === 2) return null;
  let len = h.board.length;
  let cursor = h.cursor;
  const out: number[] = [];
  while (len < 5) {
    cursor++;
    const n = len === 0 ? 3 : 1;
    for (let i = 0; i < n; i++) out.push(cursor++);
    len += n;
  }
  return out;
}

/* ───────────── fairness proofs ───────────── */

export function cardProofs(h: Hand, indices: number[]): CardProof[] {
  const levels = buildTree(h.deck, h.salts);
  return indices.map((i) => proofFor(levels, h.deck, h.salts, i));
}

export function deckRoot(deck: Card[], salts: string[]) {
  return merkleRoot(deck, salts);
}
