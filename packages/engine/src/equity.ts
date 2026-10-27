/** Equity (SPEC 13.3, U-Q1): exact enumeration when the number of remaining boards <= EXACT_ENUMERATION_MAX, else seeded Monte-Carlo. */
import { CANONICAL_DECK, type CardCode, type Entropy } from "@pokerthen/shared";
import { score, toInt } from "./eval/evaluate.js";
import { EXACT_ENUMERATION_MAX, tuning } from "./placeholders.js";
import { seededStream } from "./rng.js";

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

/** Percent equity per hand (index-aligned, ties split), rounded to 2 decimals. */
export function equity(holes: ReadonlyArray<readonly [CardCode, CardCode]>, board: readonly CardCode[], entropy: Entropy): number[] {
  const n = holes.length;
  if (n === 0) return [];
  const known = new Set<CardCode>([...board, ...holes.flat()]);
  const deck = CANONICAL_DECK.filter((c) => !known.has(c)).map(toInt);
  const need = 5 - board.length;
  const hole = holes.map((h) => [toInt(h[0]), toInt(h[1])]);
  const b0 = board.map(toInt);
  const shares = new Array<number>(n).fill(0);
  let total = 0;
  const evalBoard = (extra: number[]) => {
    const seven = [0, 0, ...b0, ...extra];
    let best = -1; let winners = 0;
    const sc = new Array<number>(n);
    for (let p = 0; p < n; p++) {
      seven[0] = hole[p]![0]!; seven[1] = hole[p]![1]!;
      const s = score(seven); sc[p] = s;
      if (s > best) { best = s; winners = 1; } else if (s === best) winners++;
    }
    for (let p = 0; p < n; p++) if (sc[p] === best) shares[p]! += 1 / winners;
    total++;
  };
  if (need === 0) evalBoard([]);
  else if (choose(deck.length, need) <= EXACT_ENUMERATION_MAX) {
    const idx: number[] = [];
    const rec = (start: number) => {
      if (idx.length === need) { evalBoard(idx.map((i) => deck[i]!)); return; }
      for (let i = start; i < deck.length; i++) { idx.push(i); rec(i + 1); idx.pop(); }
    };
    rec(0);
  } else {
    const next = seededStream(entropy);
    const d = [...deck];
    for (let run = 0; run < tuning.equityRuns; run++) {
      for (let i = 0; i < need; i++) {
        const j = i + (next() % (d.length - i));
        const t = d[i]!; d[i] = d[j]!; d[j] = t;
      }
      evalBoard(d.slice(0, need));
    }
  }
  return shares.map((s) => Math.round((s / total) * 10000) / 100);
}
