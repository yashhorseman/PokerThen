import { describe, expect, it } from 'vitest';
import { EngineError, TableState, Command, apply, nextDue, newDeck, verifyProof, buildTree, proofFor, cardProofs, rabbitCards, rabbitIndices } from '../src';
import { Sim, salts, seeded, shuffled } from './helpers';

/** Random but legal play across many hands; checks the engine's global invariants after every command. */
function playRandom(seed: number, players: number, hands: number, cfg: Record<string, unknown>) {
  const rand = seeded(seed);
  const s = new Sim({ actionSeconds: 20, bankSeconds: 10, ...cfg }, rand);
  const stacksIn = Array.from({ length: players }, () => 200 + Math.floor(rand() * 3000));
  stacksIn.forEach((st, i) => s.seat(i, st));
  s.startGame(Math.floor(rand() * 10) / 10);
  let issued = stacksIn.reduce((a, b) => a + b, 0);
  let cashedOut = 0;
  let done = 0;
  let guard = 0;

  const total = () => {
    const t = s.t;
    let sum = 0;
    t.seats.forEach((st, i) => {
      if (!st) return;
      const inHand = t.hand && t.hand.phase !== 'COMPLETE' ? t.hand.players.find((p) => p.seat === i) : undefined;
      sum += inHand ? inHand.stack + inHand.total : st.stack;
    });
    return sum;
  };

  const check = () => {
    cashedOut = s.events.filter((e) => e.type === 'seat.vacated').reduce((a, e) => a + (e.cashOut as number), 0);
    expect(total() + cashedOut).toBe(issued);
  };
  let nextMember = 100;

  while (done < hands && guard++ < 200000) {
    const t = s.t;
    const h = t.hand;
    if (!h || h.phase === 'COMPLETE') {
      if (h && h.no > done) {
        done = h.no;
        // invariants at settlement
        const paid = h.results!.pots.reduce((a, p) => a + p.awards.reduce((b, w) => b + w.winners.reduce((c, x) => c + x.amount, 0), 0), 0)
          + (h.results!.refund?.amount ?? 0);
        const contributed = h.players.reduce((a, p) => a + p.startStack - p.stack, 0); // net
        void contributed;
        const totalCommitted = h.players.reduce((a, p) => a + p.total, 0) + (h.results!.refund?.amount ?? 0);
        expect(paid).toBe(totalCommitted);
        // no folded winners
        for (const pot of h.results!.pots) for (const aw of pot.awards) for (const w of aw.winners) {
          expect(h.players.find((p) => p.seat === w.seat)!.folded).toBe(false);
        }
        // unique cards across holes, burns and boards
        const idx = [...h.players.flatMap((p) => p.holeIdx), ...h.burnIdx, ...h.boardIdx, ...h.board2Idx.filter((i) => !h.boardIdx.includes(i))];
        expect(new Set(idx).size).toBe(idx.length);
        // verify merkle proofs for the whole public record
        const proofs = cardProofs(h, idx);
        for (const p of proofs) expect(verifyProof(h.commit, p)).toBe(true);
        // seats vacated since last check: tally cashouts
      }
      // players may have left: bring new ones in so the game can continue
      for (let i = 0; i < 10 && s.t.seats.filter(Boolean).length < Math.max(2, Math.min(players, 3)); i++) {
        if (!s.t.seats[i]) { const st = 500 + Math.floor(rand() * 2000); s.seat(i, st, 'n' + nextMember++); issued += st; }
      }
      // rebuy busted / sat-out players so the game keeps going
      for (let i = 0; i < 10; i++) {
        const st = s.t.seats[i];
        if (!st) continue;
        if (st.participation === 'SITTING_OUT') s.cmd({ type: 'SIT_OUT', seat: i, value: false });
        if (s.t.seats[i]!.stack === 0) { const add = 500 + Math.floor(rand() * 1500); s.cmd({ type: 'ADD_CHIPS', seat: i, amount: add }); issued += add; }
      }
      const due = nextDue(s.t);
      if (due?.kind === 'START_HAND') {
        s.now = Math.max(s.now, due.at);
        s.cmd({ type: 'START_HAND', handId: 'h' + (s.t.handNo + 1), deck: shuffled(rand), salts: salts() });
      } else if (!due) {
        s.cmd({ type: 'NEXT_HAND' });
      }
      check();
      continue;
    }

    // mid-hand: occasionally have someone vote, leave, sit out or time out
    if (h.phase === 'RUNOUT_VOTE') {
      for (const p of h.players.filter((x) => !x.folded && x.vote === null)) {
        try { s.cmd({ type: 'VOTE', seat: p.seat, yes: rand() < 0.7 }); } catch { /* may have resolved */ }
        if (s.t.hand!.phase !== 'RUNOUT_VOTE') break;
      }
      check();
      continue;
    }
    if (h.phase === 'RUNOUT') { s.now = Math.max(s.now, h.stepAt!); s.cmd({ type: 'STEP' }); check(); continue; }

    const seat = h.toAct as number;
    const p = h.players.find((x) => x.seat === seat)!;
    const lg = (apply as unknown) && require_legal(s.t, seat);
    const r = rand();
    try {
      if (r < 0.02) { s.cmd({ type: 'LEAVE', seat }); }
      else if (r < 0.04) { s.now = h.deadline!; s.cmd({ type: 'TIMEOUT', turnId: h.turnId }); }
      else if (r < 0.2 && lg.callAmount > 0) s.act(seat, 'fold');
      else if (r < 0.6) s.act(seat, lg.canCheck ? 'check' : 'call');
      else if (r < 0.9 && lg.canRaise) {
        const span = lg.maxRaiseTo - lg.minRaiseTo;
        s.act(seat, 'raise', lg.minRaiseTo + Math.floor(rand() * Math.min(span, 4 * cfgBB(cfg)) + (rand() < 0.5 ? 0 : 0)));
      } else if (lg.canRaise || lg.callIsAllIn) s.act(seat, 'allin');
      else s.act(seat, lg.canCheck ? 'check' : 'call');
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      throw new Error(`illegal move from legalActions-derived action: ${e.code} ${e.message}\n${JSON.stringify(lg)} ${p.stack}`);
    }
    // chips never created or destroyed
    check();
  }
  expect(done).toBeGreaterThanOrEqual(hands);
}
const cfgBB = (cfg: Record<string, unknown>) => (cfg.bb as number) ?? 20;
import { legalActions } from '../src';
function require_legal(t: TableState, seat: number) { const l = legalActions(t, seat); if (!l) throw new Error('no legal actions for actor'); return l; }

describe('randomised play (property tests)', () => {
  it('conserves chips, deals unique cards, never lets a folded player win, proofs always verify — 2..9 players', () => {
    for (let n = 2; n <= 9; n++) playRandom(1000 + n, n, 150, { sb: 10, bb: 20 });
  });
  it('same with antes, run-it-twice always, and ask mode', () => {
    playRandom(7, 6, 150, { sb: 5, bb: 10, ante: 2, runTwice: 'always' });
    playRandom(8, 5, 150, { sb: 25, bb: 50, ante: 5, runTwice: 'ask' });
  });
  it('rabbit proofs: undealt cards can be proven against the original commitment', () => {
    const rand = seeded(5);
    const s = new Sim({ actionSeconds: null, bankSeconds: 0, rabbit: true }, rand);
    s.seat(0, 1000); s.seat(1, 1000); s.startGame();
    s.startHand(shuffled(rand));
    s.act(s.h.toAct!, 'raise', 80); s.act(s.h.toAct!, 'fold');
    const cards = rabbitCards(s.t)!; const idx = rabbitIndices(s.t)!;
    expect(cards).toHaveLength(5);
    const proofs = cardProofs(s.h, idx);
    proofs.forEach((p, i) => { expect(p.card).toBe(cards[i]); expect(verifyProof(s.h.commit, p)).toBe(true); });
    void newDeck; void buildTree; void proofFor; void (null as unknown as Command);
  });
});
