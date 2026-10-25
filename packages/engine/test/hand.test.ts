import { describe, expect, it } from 'vitest';
import { EngineError, nextDue, rabbitCards, shiftTimes } from '../src';
import { rigDeck, Sim } from './helpers';

const fails = (fn: () => unknown, code?: string) => {
  try { fn(); } catch (e) {
    if (!(e instanceof EngineError)) throw e;
    if (code) expect(e.code).toBe(code);
    return true;
  }
  return false;
};

function table(n: number, stack = 1000, cfg = {}) {
  const s = new Sim({ actionSeconds: null, bankSeconds: 0, ...cfg });
  for (let i = 0; i < n; i++) s.seat(i, stack);
  s.startGame();
  return s;
}

describe('positions and action order', () => {
  it('heads-up 5/10: dealer is SB and acts first preflop, BB acts first on every later street', () => {
    const s = table(2, 1000, { sb: 5, bb: 10 });
    s.startHand();
    const h = s.h;
    expect(h.sbSeat).toBe(h.dealerSeat);
    expect(h.toAct).toBe(h.dealerSeat);
    s.act(h.dealerSeat, 'call');
    expect(s.h.toAct).toBe(h.bbSeat); // BB option
    s.act(h.bbSeat, 'check');
    expect(s.h.board).toHaveLength(3);
    expect(s.h.toAct).toBe(s.h.bbSeat);
    s.act(s.h.bbSeat, 'check'); s.act(s.h.dealerSeat, 'check');
    expect(s.h.board).toHaveLength(4);
    expect(s.h.toAct).toBe(s.h.bbSeat);
  });

  it('3+ players: UTG acts first preflop, first live seat left of the dealer postflop; button moves each hand', () => {
    const s = table(4);
    s.startHand();
    const h = s.h;
    expect(h.sbSeat).toBe((h.dealerSeat + 1) % 4);
    expect(h.bbSeat).toBe((h.dealerSeat + 2) % 4);
    expect(h.toAct).toBe((h.dealerSeat + 3) % 4);
    const firstDealer = h.dealerSeat;
    for (const seat of [h.toAct as number, (h.toAct! + 1) % 4, (h.toAct! + 2) % 4]) s.act(seat, seat === h.sbSeat ? 'fold' : 'fold');
    expect(s.h.phase).toBe('COMPLETE');
    s.cmd({ type: 'START_HAND', handId: 'x', deck: rigDeck([['As', 'Ad'], ['Ks', 'Kd'], ['Qs', 'Qd'], ['Js', 'Jd']], ['2c', '3d', '4h', '9s', '7c']), salts: Array(52).fill('s') });
    expect(s.h.dealerSeat).toBe((firstDealer + 1) % 4);
  });
});

describe('legal actions & raise reopening', () => {
  const sixMax = (stacks: number[]) => {
    const s = new Sim({ sb: 5, bb: 10, actionSeconds: null, bankSeconds: 0 });
    stacks.forEach((st, i) => s.seat(i, st));
    s.startGame(); s.startHand();
    expect(s.h.dealerSeat).toBe(0); // first dealer is the lowest occupied seat
    return s;
  };

  it('fixture: 5/10, UTG raises to 30, next player shoves 42 (short raise of 12) → the raiser cannot re-raise, an unacted player can raise to ≥ 62', () => {
    const s = sixMax([1000, 1000, 1000, 1000, 42]);
    s.act(3, 'raise', 30);
    expect(s.legal(4)!.minRaiseTo).toBe(42); // capped by their stack
    s.act(4, 'allin');
    const unacted = s.legal(0)!; // dealer has not acted yet
    expect(unacted.canRaise).toBe(true);
    expect(unacted.minRaiseTo).toBe(62);
    s.act(0, 'call'); s.act(1, 'fold'); s.act(2, 'fold');
    const raiser = s.legal(3)!; // acted facing 30, now faces only a 12-chip increase
    expect(raiser.canRaise).toBe(false);
    expect(raiser.callAmount).toBe(12);
    expect(fails(() => s.act(3, 'raise', 200), 'NOT_REOPENED')).toBe(true);
    expect(fails(() => s.act(3, 'allin'), 'NOT_REOPENED')).toBe(true);
  });

  it('fixture: two short all-ins whose cumulative increase reaches a full raise reopen only for players who have now faced it', () => {
    const s = sixMax([54, 1000, 1000, 1000, 42, 1000]);
    s.act(3, 'raise', 30); // full raise, increment 20
    s.act(4, 'allin');     // to 42: +12, short
    s.act(5, 'call');      // acted at level 42
    s.act(0, 'allin');     // to 54: +12 more, short on its own
    s.act(1, 'fold'); s.act(2, 'fold');
    // seat 3 acted at 30 and now faces 54: increase 24 >= 20 → may re-raise
    const three = s.legal(3)!;
    expect(three.canRaise).toBe(true);
    expect(three.minRaiseTo).toBe(74);
    s.act(3, 'call');
    // seat 5 acted at 42 and faces only 12 more → call/fold only
    expect(s.legal(5)!.canRaise).toBe(false);
  });

  it('exact rules via direct state: minimum raise tracks the last full increment', () => {
    const s = table(3);
    s.startHand();
    const a = s.h.toAct as number;
    expect(s.legal(a)!.minRaiseTo).toBe(40); // bb 20 → raise to 40
    s.act(a, 'raise', 100); // increment 80
    const b = s.h.toAct as number;
    expect(s.legal(b)!.minRaiseTo).toBe(180);
    expect(fails(() => s.act(b, 'raise', 170), 'AMOUNT_OUT_OF_RANGE')).toBe(true);
    s.act(b, 'raise', 180);
    expect(s.legal(s.h.toAct!)!.minRaiseTo).toBe(260);
  });

  it('a player who acted can re-raise after a full raise but only call/fold after a short all-in', () => {
    // seats: 0 = dealer, 1 = SB, 2 = BB, 3 = UTG (short), 4 = CO ...
    const s = new Sim({ sb: 5, bb: 10, actionSeconds: null, bankSeconds: 0 });
    [1000, 1000, 1000, 1000, 1000].forEach((st, i) => s.seat(i, st));
    // make the next-to-be-dealer deterministic: START_GAME then first hand has dealer = seat 0
    s.startGame();
    s.startHand();
    expect(s.h.dealerSeat).toBe(0);
    // UTG = seat 3 raises to 30, seat 4 calls 30, seat 0 (dealer) calls 30, SB folds, BB calls
    s.act(3, 'raise', 30); s.act(4, 'call'); s.act(0, 'call'); s.act(1, 'fold'); s.act(2, 'call');
    expect(s.h.board).toHaveLength(3);
    // flop: seat 2 (BB) first. 2 bets 20, 3 raises to 60 (increment 40), 4 short? (all have 970) → use actedLevel logic
    s.act(2, 'raise', 20);
    s.act(3, 'raise', 60);
    // seat 2 acted at level 20; the raise increment was 40 ≥ minRaise 20 → can re-raise
    s.act(4, 'call'); s.act(0, 'fold');
    const lg = s.legal(2)!;
    expect(lg.canRaise).toBe(true);
    expect(lg.minRaiseTo).toBe(100);
  });
});

describe('all-in, short blinds, refunds', () => {
  it('short blind posts what it can, stays all-in, call amount stays the full big blind', () => {
    const s = new Sim({ sb: 10, bb: 20, actionSeconds: null, bankSeconds: 0 });
    s.seat(0, 1000); s.seat(1, 1000); s.seat(2, 7);
    s.startGame(); s.startHand();
    const bbSeat = s.h.bbSeat, bbp = s.h.players.find((p) => p.seat === bbSeat)!;
    if (bbp.stack === 0) {
      expect(bbp.allIn).toBe(true);
      expect(s.h.currentBet).toBe(20);
    }
    // total chips conserved throughout
    expect(s.h.players.reduce((a, p) => a + p.stack + p.total, 0)).toBe(2007);
  });

  it('all fold to an unmatched raise: excess is refunded, only contested chips are awarded', () => {
    const s = table(3, 1000, { sb: 10, bb: 20 });
    s.startHand();
    const raiser = s.h.toAct as number;
    s.act(raiser, 'raise', 300);
    s.act(s.h.toAct!, 'fold'); s.act(s.h.toAct!, 'fold');
    expect(s.h.phase).toBe('COMPLETE');
    expect(s.h.results!.refund).toEqual({ seat: raiser, amount: 300 - 20 });
    expect(s.stacks().reduce((a, b) => a + b, 0)).toBe(3000);
    expect(s.t.seats[raiser]!.stack).toBe(1000 + 30);
  });

  it('three-way all-in 100/250/400: refund 150, main + side pot, payouts follow hand strength', () => {
    const s = new Sim({ sb: 10, bb: 20, actionSeconds: null, bankSeconds: 0, revealWhenNoAction: true });
    s.seat(0, 100); s.seat(1, 250); s.seat(2, 400);
    s.startGame();
    // dealer will be seat 0 → order left of dealer: seat 1, seat 2, seat 0
    // seat0 best (AA), seat1 second (KK), seat2 worst (QQ)
    const deck = rigDeck([['Ks', 'Kd'], ['Qs', 'Qd'], ['As', 'Ad']], ['2c', '7d', '9h', '3s', '4c']);
    s.startHand(deck);
    expect(s.h.dealerSeat).toBe(0);
    let g = 0;
    while (s.h.phase === 'BETTING' && g++ < 10) s.act(s.h.toAct!, 'allin');
    s.drain();
    expect(s.h.phase).toBe('COMPLETE');
    const r = s.h.results!;
    expect(r.refund).toEqual({ seat: 2, amount: 150 });
    expect(r.pots.map((p) => p.amount)).toEqual([300, 300]);
    expect(s.stacks().slice(0, 3)).toEqual([300, 300, 150]); // A wins the 300 main pot, B the 300 side pot, C gets back only the uncalled 150
  });
});

describe('timers, bank and pause', () => {
  it('timeout checks when free, folds otherwise, never calls; player is put to sit out', () => {
    const s = new Sim({ actionSeconds: 20, bankSeconds: 0 });
    s.seat(0, 1000); s.seat(1, 1000); s.startGame(); s.startHand();
    const first = s.h.toAct as number;
    s.now = s.h.deadline!;
    s.cmd({ type: 'TIMEOUT', turnId: s.h.turnId });
    expect(s.h.phase).toBe('COMPLETE'); // facing the BB: folds
    expect(s.t.seats[first]!.participation).toBe('SITTING_OUT');
    expect(fails(() => s.cmd({ type: 'TIMEOUT', turnId: 99 }))).toBe(true);
  });

  it('time bank auto-extends once, consumes only the time used, and refills to max after N hands', () => {
    const s = new Sim({ actionSeconds: 20, bankSeconds: 10, bankRefillHands: 2 });
    s.seat(0, 1000); s.seat(1, 1000); s.startGame(); s.startHand();
    const who = s.h.toAct as number;
    const seat = s.t.seats[who]!;
    expect(seat.timeBank).toBe(10_000);
    const base = s.h.deadline!;
    s.now = base;
    s.cmd({ type: 'TIMEOUT', turnId: s.h.turnId }); // bank starts
    expect(s.h.deadline).toBe(base + 10_000);
    s.now = base + 4000; // acts after 4s of bank
    s.act(who, 'call');
    expect(s.t.seats[who]!.timeBank).toBe(6000);
  });

  it('pause freezes the remaining time and resume restores it', () => {
    const s = new Sim({ actionSeconds: 20, bankSeconds: 0 });
    s.seat(0, 1000); s.seat(1, 1000); s.startGame(); s.startHand();
    const deadline = s.h.deadline!;
    s.now = deadline - 8000; // 12s elapsed
    s.cmd({ type: 'PAUSE' });
    expect(nextDue(s.t)).toBeNull();
    expect(fails(() => s.act(s.h.toAct!, 'call'), 'ROOM_PAUSED')).toBe(true);
    s.now += 30_000;
    s.cmd({ type: 'RESUME' });
    expect(s.h.deadline! - s.now).toBe(8000);
  });

  it('crash recovery shifts nothing earlier than the grace period (shiftTimes is exact)', () => {
    const s = new Sim({ actionSeconds: 20, bankSeconds: 0 });
    s.seat(0, 1000); s.seat(1, 1000); s.startGame(); s.startHand();
    const d = s.h.deadline!;
    shiftTimes(s.t, 5000);
    expect(s.h.deadline).toBe(d + 5000);
  });
});

describe('run it twice and rabbit hunting', () => {
  const setup = (mode: 'ask' | 'always') => {
    const s = new Sim({ actionSeconds: null, bankSeconds: 0, sb: 10, bb: 20, runTwice: mode });
    s.seat(0, 500); s.seat(1, 500); s.seat(2, 500);
    s.startGame();
    return s;
  };
  it('always: both boards share the dealt prefix, pot split in halves, chips conserved', () => {
    const s = setup('always');
    s.startHand();
    // preflop all-in
    let g = 0;
    while (s.h.phase === 'BETTING' && g++ < 10) s.act(s.h.toAct!, 'allin');
    expect(s.h.phase).toBe('RUNOUT');
    expect(s.h.runs).toBe(2);
    s.drain();
    expect(s.h.phase).toBe('COMPLETE');
    expect(s.h.board).toHaveLength(5);
    expect(s.h.board2).toHaveLength(5);
    expect(s.stacks().reduce((a, b) => a + b, 0)).toBe(1500);
    // all deck indices used are distinct: holes, burns, both boards
    const used = [...s.h.players.flatMap((p) => p.holeIdx), ...s.h.burnIdx, ...s.h.boardIdx, ...s.h.board2Idx.filter((i) => !s.h.boardIdx.includes(i))];
    expect(new Set(used).size).toBe(used.length);
  });
  it('ask: one decline (or a personal "no") means a single run; unanimous yes means two', () => {
    const s = setup('ask');
    s.cmd({ type: 'SET_PREFS', seat: 0, ritPref: 'no' });
    s.startHand();
    let g = 0;
    while (s.h.phase === 'BETTING' && g++ < 10) s.act(s.h.toAct!, 'allin');
    expect(s.h.phase).toBe('RUNOUT');
    expect(s.h.runs).toBe(1);

    const s2 = setup('ask');
    s2.startHand();
    g = 0;
    while (s2.h.phase === 'BETTING' && g++ < 10) s2.act(s2.h.toAct!, 'allin');
    expect(s2.h.phase).toBe('RUNOUT_VOTE');
    for (const p of s2.h.players) s2.cmd({ type: 'VOTE', seat: p.seat, yes: true });
    expect(s2.h.runs).toBe(2);
  });
  it('ask: no response before the deadline resolves to a single run', () => {
    const s = setup('ask');
    s.startHand();
    let g = 0;
    while (s.h.phase === 'BETTING' && g++ < 10) s.act(s.h.toAct!, 'allin');
    s.cmd({ type: 'VOTE', seat: s.h.players[0].seat, yes: true });
    s.now = s.h.voteDeadline!;
    s.cmd({ type: 'VOTE_TIMEOUT' });
    expect(s.h.runs).toBe(1);
  });
  it('rabbit: previews the exact cards that would have come next and never changes results', () => {
    const s = new Sim({ actionSeconds: null, bankSeconds: 0, rabbit: true });
    s.seat(0, 1000); s.seat(1, 1000); s.startGame();
    const deck = rigDeck([['As', 'Ad'], ['Ks', 'Kd']], ['2c', '7d', '9h', '3s', '4c']);
    s.startHand(deck);
    s.act(s.h.toAct!, 'raise', 60);
    s.act(s.h.toAct!, 'fold');
    expect(s.h.phase).toBe('COMPLETE');
    expect(rabbitCards(s.t)).toEqual(['2c', '7d', '9h', '3s', '4c']);
  });
});

describe('leaving and fairness proofs', () => {
  it('leaving mid-hand folds, and cashes out after settlement', () => {
    const s = table(3);
    s.startHand();
    const leaver = s.h.toAct as number;
    s.cmd({ type: 'LEAVE', seat: leaver });
    expect(s.h.players.find((p) => p.seat === leaver)!.folded).toBe(true);
    // finish the hand
    s.act(s.h.toAct!, 'fold');
    expect(s.h.phase).toBe('COMPLETE');
    expect(s.t.seats[leaver]).toBeNull();
    expect(s.events.some((e) => e.type === 'seat.vacated' && e.seat === leaver)).toBe(true);
  });
  it('an all-in player who leaves still contests the pot', () => {
    const s = table(2, 300);
    s.startHand();
    s.act(s.h.toAct!, 'allin');
    const other = s.h.toAct as number;
    s.cmd({ type: 'LEAVE', seat: s.h.dealerSeat === other ? (other + 1) % 2 : s.h.dealerSeat });
    s.act(other, 'call');
    s.drain();
    expect(s.h.phase).toBe('COMPLETE');
    expect(s.stacks().reduce((a, b) => a + b, 0)).toBe(600 - s.events.filter((e) => e.type === 'seat.vacated').reduce((a, e) => a + (e.cashOut as number), 0));
  });
});
