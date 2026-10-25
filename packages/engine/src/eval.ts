import { Card, rankValue, rankName } from './cards';

export interface HandValue {
  /** Comparable score: higher is better. Equal score = exact tie. */
  score: number;
  category: number; // 0 high card … 8 straight flush
  /** tie-break ranks, most significant first (2–14) */
  tb: number[];
  name: string; // "Two Pair, Aces and Fours"
  best: Card[]; // the five cards that make the hand
}

const CAT_NAMES = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];
const BASE = 15;

export function eval5(cs: Card[]): HandValue {
  const vals = cs.map(rankValue).sort((a, b) => b - a);
  const flush = cs.every((c) => c[1] === cs[0][1]);
  let straight = false;
  let high = vals[0];
  if (new Set(vals).size === 5) {
    if (vals[0] - vals[4] === 4) straight = true;
    else if (vals[0] === 14 && vals[1] === 5 && vals[4] === 2) { straight = true; high = 5; } // wheel
  }
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let category: number;
  let tb: number[];
  if (straight && flush) { category = 8; tb = [high]; }
  else if (groups[0][1] === 4) { category = 7; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { category = 6; tb = groups.map((g) => g[0]); }
  else if (flush) { category = 5; tb = vals; }
  else if (straight) { category = 4; tb = [high]; }
  else if (groups[0][1] === 3) { category = 3; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { category = 2; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2) { category = 1; tb = groups.map((g) => g[0]); }
  else { category = 0; tb = vals; }
  let score = category;
  for (let i = 0; i < 5; i++) score = score * BASE + (tb[i] || 0);
  return { score, category, tb, name: describe(category, tb), best: cs.slice() };
}

function describe(cat: number, tb: number[]): string {
  switch (cat) {
    case 8: return tb[0] === 14 ? 'Royal Flush' : `Straight Flush, ${rankName(tb[0])} high`;
    case 7: return `Four of a Kind, ${rankName(tb[0], true)}`;
    case 6: return `Full House, ${rankName(tb[0], true)} full of ${rankName(tb[1], true)}`;
    case 5: return `Flush, ${rankName(tb[0])} high`;
    case 4: return `Straight, ${rankName(tb[0])} high`;
    case 3: return `Three of a Kind, ${rankName(tb[0], true)}`;
    case 2: return `Two Pair, ${rankName(tb[0], true)} and ${rankName(tb[1], true)}`;
    case 1: return `Pair of ${rankName(tb[0], true)}`;
    default: return `High Card, ${rankName(tb[0])}`;
  }
}

/** Best five-card hand from 5–7 cards (Texas Hold'em: any five of the seven). */
export function bestHand(cards: Card[]): HandValue {
  let best: HandValue | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const h = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || h.score > best.score) best = h;
          }
  return best as HandValue;
}

export { CAT_NAMES };

const RANK_SHORT: Record<number, string> = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rs = (v: number) => RANK_SHORT[v] ?? String(v);

/** Short badge text shown under a player's cards while the board is revealed, e.g. "PAIR (7)", "TWO PAIR (8,2)". */
export function handLabel(v: HandValue): string {
  const t = v.tb;
  switch (v.category) {
    case 8: return t[0] === 14 ? 'ROYAL FLUSH' : `STRAIGHT FLUSH (${rs(t[0])})`;
    case 7: return `FOUR OF A KIND (${rs(t[0])})`;
    case 6: return `FULL HOUSE (${rs(t[0])},${rs(t[1])})`;
    case 5: return `FLUSH (${rs(t[0])})`;
    case 4: return `STRAIGHT (${rs(t[0])})`;
    case 3: return `THREE OF A KIND (${rs(t[0])})`;
    case 2: return `TWO PAIR (${rs(t[0])},${rs(t[1])})`;
    case 1: return `PAIR (${rs(t[0])})`;
    default: return 'HIGH CARD';
  }
}
