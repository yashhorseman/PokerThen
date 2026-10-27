/** 7-card evaluator. Card ints: rank*4+suit (rank 2..14, suit 0..3 = s,h,d,c). Score = category<<20 | five rank nibbles. */
import { RANKS, SUITS, type CardCode } from "@pokerthen/shared";

export const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8 } as const;

export function toInt(c: CardCode): number {
  return (RANKS.indexOf(c[0] as never) + 2) * 4 + SUITS.indexOf(c[1] as never);
}
export function fromInt(n: number): CardCode {
  return (RANKS[(n >> 2) - 2]! + SUITS[n & 3]!) as CardCode;
}

function highestStraight(mask: number): number {
  // bit r set for rank r (2..14); ace also counts as 1 (bit 1)
  const m = mask | ((mask >> 14) & 1 ? 2 : 0);
  for (let hi = 14; hi >= 5; hi--) {
    const need = 0x1f << (hi - 4);
    if ((m & need) === need) return hi;
  }
  return 0;
}

const pack = (cat: number, r: number[]): number =>
  (cat << 20) | ((r[0] ?? 0) << 16) | ((r[1] ?? 0) << 12) | ((r[2] ?? 0) << 8) | ((r[3] ?? 0) << 4) | (r[4] ?? 0);

/** Score of the best five of up to 7 cards (ints). Higher is better. */
export function score(cards: readonly number[]): number {
  const cnt = new Array<number>(15).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCnt = [0, 0, 0, 0];
  let all = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    cnt[r]!++; suitMask[s]! |= 1 << r; suitCnt[s]!++; all |= 1 << r;
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCnt[s]! >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sh = highestStraight(suitMask[flushSuit]!);
    if (sh) return pack(CAT.STRAIGHT_FLUSH, [sh]);
  }
  let quad = 0; const trips: number[] = []; const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const n = cnt[r]!;
    if (n === 4) quad = r; else if (n === 3) trips.push(r); else if (n === 2) pairs.push(r);
  }
  const kickers = (excl: number[], n: number): number[] => {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < n; r--) if (cnt[r]! > 0 && !excl.includes(r)) out.push(r);
    return out;
  };
  if (quad) return pack(CAT.QUADS, [quad, ...kickers([quad], 1)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0]!;
    const p = trips.length > 1 ? Math.max(trips[1]!, pairs[0] ?? 0) : pairs[0]!;
    return pack(CAT.FULL_HOUSE, [t, p]);
  }
  if (flushSuit >= 0) {
    const out: number[] = [];
    for (let r = 14; r >= 2 && out.length < 5; r--) if (suitMask[flushSuit]! & (1 << r)) out.push(r);
    return pack(CAT.FLUSH, out);
  }
  const st = highestStraight(all);
  if (st) return pack(CAT.STRAIGHT, [st]);
  if (trips.length) return pack(CAT.TRIPS, [trips[0]!, ...kickers([trips[0]!], 2)]);
  if (pairs.length >= 2) return pack(CAT.TWO_PAIR, [pairs[0]!, pairs[1]!, ...kickers([pairs[0]!, pairs[1]!], 1)]);
  if (pairs.length === 1) return pack(CAT.PAIR, [pairs[0]!, ...kickers([pairs[0]!], 3)]);
  return pack(CAT.HIGH, kickers([], 5));
}

export const category = (sc: number): number => sc >> 20;
export const nibbles = (sc: number): number[] => [(sc >> 16) & 15, (sc >> 12) & 15, (sc >> 8) & 15, (sc >> 4) & 15, sc & 15];

export function scoreCodes(cards: readonly CardCode[]): number {
  return score(cards.map(toInt));
}

/**
 * The five cards that make the hand, in the observed "combination" order: groups ascending by (count, rank), i.e. kickers low to
 * high, then pairs, then trips; straights/flushes ascending (wheel: A first). Same-rank cards keep input order (hole cards first).
 */
export function bestFive(cards: readonly CardCode[]): CardCode[] {
  const sc = scoreCodes(cards);
  const cat = category(sc);
  const nb = nibbles(sc);
  const ints = cards.map(toInt);
  // live (SPEC 12.2 straight example): the LAST dealt card of a rank is used (hole cards first, then board in deal order)
  const pickRank = (r: number, n: number, pool: number[]): number[] => pool.filter((c) => c >> 2 === r).slice(-n);
  let chosen: number[] = [];
  if (cat === CAT.STRAIGHT || cat === CAT.STRAIGHT_FLUSH) {
    const hi = nb[0]!;
    let pool = ints;
    if (cat === CAT.STRAIGHT_FLUSH) {
      for (let s = 0; s < 4; s++) {
        const p = ints.filter((c) => (c & 3) === s);
        if (p.length >= 5 && highestStraight(p.reduce((m, c) => m | (1 << (c >> 2)), 0)) === hi) pool = p;
      }
    }
    const ranks = hi === 5 ? [14, 2, 3, 4, 5] : [hi - 4, hi - 3, hi - 2, hi - 1, hi];
    for (const r of ranks) chosen.push(pickRank(r, 1, pool)[0]!);
    return chosen.map(fromInt);
  }
  if (cat === CAT.FLUSH) {
    for (let s = 0; s < 4; s++) {
      const p = ints.filter((c) => (c & 3) === s);
      if (p.length >= 5) chosen = p.sort((a, b) => b - a).slice(0, 5).sort((a, b) => (a >> 2) - (b >> 2));
    }
    return chosen.map(fromInt);
  }
  const groups: Array<[number, number]> = []; // [count, rank]
  const add = (r: number, n: number) => groups.push([n, r]);
  if (cat === CAT.QUADS) { add(nb[0]!, 4); add(nb[1]!, 1); }
  else if (cat === CAT.FULL_HOUSE) { add(nb[0]!, 3); add(nb[1]!, 2); }
  else if (cat === CAT.TRIPS) { add(nb[0]!, 3); add(nb[1]!, 1); add(nb[2]!, 1); }
  else if (cat === CAT.TWO_PAIR) { add(nb[0]!, 2); add(nb[1]!, 2); add(nb[2]!, 1); }
  else if (cat === CAT.PAIR) { add(nb[0]!, 2); add(nb[1]!, 1); add(nb[2]!, 1); add(nb[3]!, 1); }
  else for (let i = 0; i < 5; i++) add(nb[i]!, 1);
  groups.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [n, r] of groups) chosen.push(...pickRank(r, n, ints));
  return chosen.map(fromInt);
}
