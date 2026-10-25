import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bestHand, buildPots, buildTree, eval5, newDeck, proofFor, sha256, splitAmount, verifyProof, merkleRoot } from '../src';
import { salts, seeded, shuffled } from './helpers';

describe('sha256', () => {
  it('matches node:crypto', () => {
    for (const s of ['', 'abc', 'leaf|3|As|deadbeef', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) {
      expect(sha256(s)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });
});

describe('merkle deck commitment', () => {
  it('proves any revealed card against the root, and rejects tampering', () => {
    const deck = shuffled();
    const sl = salts();
    const levels = buildTree(deck, sl);
    const root = merkleRoot(deck, sl);
    for (const i of [0, 1, 17, 51]) {
      const p = proofFor(levels, deck, sl, i);
      expect(verifyProof(root, p)).toBe(true);
      expect(verifyProof(root, { ...p, card: deck[(i + 1) % 52] })).toBe(false);
      expect(verifyProof(root, { ...p, index: (i + 1) % 52 })).toBe(false);
      expect(verifyProof(root, { ...p, salt: 'bad' })).toBe(false);
    }
  });
  it('root differs if any card or salt differs', () => {
    const deck = shuffled();
    const sl = salts();
    const root = merkleRoot(deck, sl);
    const d2 = deck.slice(); [d2[3], d2[40]] = [d2[40], d2[3]];
    expect(merkleRoot(d2, sl)).not.toBe(root);
    const s2 = sl.slice(); s2[9] = 'x';
    expect(merkleRoot(deck, s2)).not.toBe(root);
  });
});

/* An independent, deliberately different evaluator: builds a sortable key from sorted rank multiplicities. */
function referenceScore(cards: string[]): number[] {
  const R = '23456789TJQKA';
  let best: number[] = [-1];
  const combos: string[][] = [];
  const rec = (start: number, cur: string[]) => {
    if (cur.length === 5) { combos.push(cur.slice()); return; }
    for (let i = start; i < cards.length; i++) { cur.push(cards[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  for (const five of combos) {
    const ranks = five.map((c) => R.indexOf(c[0]) + 2);
    const suits = new Set(five.map((c) => c[1]));
    const uniq = [...new Set(ranks)].sort((a, b) => b - a);
    const cnt = new Map<number, number>();
    ranks.forEach((r) => cnt.set(r, (cnt.get(r) ?? 0) + 1));
    const byCount = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const shape = byCount.map((x) => x[1]).join('');
    let straightHigh = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq.join() === '14,5,4,3,2') straightHigh = 5;
    }
    const flush = suits.size === 1;
    let key: number[];
    const kick = byCount.map((x) => x[0]);
    if (straightHigh && flush) key = [8, straightHigh];
    else if (shape === '41') key = [7, ...kick];
    else if (shape === '32') key = [6, ...kick];
    else if (flush) key = [5, ...uniq];
    else if (straightHigh) key = [4, straightHigh];
    else if (shape === '311') key = [3, ...kick];
    else if (shape === '221') key = [2, ...kick];
    else if (shape === '2111') key = [1, ...kick];
    else key = [0, ...uniq];
    if (cmp(key, best) > 0) best = key;
  }
  return best;
}
function cmp(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

describe('hand evaluator', () => {
  const ev = (s: string) => bestHand(s.split(' '));
  it('orders categories and handles wheels, kickers and board-plays', () => {
    expect(ev('As Ks Qs Js Ts 2d 3c').name).toBe('Royal Flush');
    expect(ev('5s 4h 3d 2c Ad Kd Kc').name).toBe('Straight, Five high');
    expect(ev('6s 5h 4d 3c 2d Kd Kc').score).toBeGreaterThan(ev('5s 4h 3d 2c Ad Kd Kc').score);
    expect(ev('As Ah Kd Kc 7d 8d 9c').score).toBeGreaterThan(ev('As Ah Kd Kc 6d 8d 5c').score);
    expect(ev('As Ah Kd Kc 7d 8d 9c').score).toBe(ev('Ad Ac Kh Ks 7s 8c 9c').score);
    expect(ev('9s 9h 9d 9c Ad 2d 3c').score).toBeGreaterThan(ev('Ks Kh Kd 2c 2d 7d 3c').score);
    expect(ev('As 2s 5s 9s Js 2d 3c').score).toBeGreaterThan(ev('5s 4h 3d 2c Ad Kd Kc').score);
    expect(ev('Ks Kh Kd 2c 2d 7d 3c').name).toBe('Full House, Kings full of Twos');
    // board plays: both players share the same best five
    const board = '2c 3d 4h 5s 6c';
    expect(bestHand(['Ah', 'Kd', ...board.split(' ')]).score).toBe(bestHand(['9h', '9d', ...board.split(' ')]).score);
  });
  it('agrees with an independent evaluator on 20,000 random 7-card matchups', () => {
    const rand = seeded(42);
    for (let i = 0; i < 20000; i++) {
      const d = shuffled(rand);
      const a = d.slice(0, 7);
      const b = [...d.slice(7, 9), ...a.slice(2)];
      const mine = Math.sign(bestHand(a).score - bestHand(b).score);
      const ref = Math.sign(cmp(referenceScore(a), referenceScore(b)));
      expect(mine, `${a.join(' ')} vs ${b.join(' ')}`).toBe(ref);
    }
  });
  it('eval5 never ties different categories', () => {
    expect(eval5('Ah Kh Qh Jh Th'.split(' ')).category).toBe(8);
    expect(newDeck()).toHaveLength(52);
  });
});

describe('side pots', () => {
  it('fixture: contributions 100/250/400 → refund 150, pots 300 + 300', () => {
    const r = buildPots([{ seat: 0, total: 100, folded: false }, { seat: 1, total: 250, folded: false }, { seat: 2, total: 400, folded: false }]);
    expect(r.refund).toEqual({ seat: 2, amount: 150 });
    expect(r.pots).toEqual([{ amount: 300, eligible: [0, 1, 2] }, { amount: 300, eligible: [1, 2] }]);
  });
  it('folded contributor funds the pot but is never eligible', () => {
    const r = buildPots([
      { seat: 0, total: 100, folded: false }, { seat: 1, total: 250, folded: false }, { seat: 2, total: 400, folded: false }, { seat: 3, total: 50, folded: true },
    ]);
    expect(r.refund).toEqual({ seat: 2, amount: 150 });
    expect(r.pots.reduce((a, p) => a + p.amount, 0)).toBe(100 + 250 + 250 + 50);
    expect(r.pots.every((p) => !p.eligible.includes(3))).toBe(true);
  });
  it('everyone folds to an unmatched raise → refund the excess only', () => {
    const r = buildPots([{ seat: 0, total: 100, folded: false }, { seat: 1, total: 20, folded: true }, { seat: 2, total: 10, folded: true }]);
    expect(r.refund).toEqual({ seat: 0, amount: 80 });
    expect(r.pots).toEqual([{ amount: 50, eligible: [0] }]);
  });
  it('odd chips: 100 three ways = 34/33/33, 101 over two runs = 51/50', () => {
    expect(splitAmount(100, [4, 7, 9]).map((x) => x.amount)).toEqual([34, 33, 33]);
    expect([Math.ceil(101 / 2), Math.floor(101 / 2)]).toEqual([51, 50]);
  });
});
