import { describe, expect, it } from "vitest";
import { CANONICAL_DECK, type CardCode } from "@pokerthen/shared";
import { seededEntropy } from "@pokerthen/shared/testing";
import { bestFive, scoreCodes, category, CAT } from "../src/eval/evaluate.js";
import { chipName, logName } from "../src/eval/names.js";
import { equity } from "../src/equity.js";
import { tuning } from "../src/placeholders.js";

const rv = (c: CardCode) => "23456789TJQKA".indexOf(c[0]!) + 2;
/** independent brute force: best of all 21 five-card subsets with a naive 5-card ranker */
function rank5(cs: CardCode[]): number[] {
  const r = cs.map(rv).sort((a, b) => b - a);
  const flush = cs.every((c) => c[1] === cs[0]![1]);
  const uniq = [...new Set(r)];
  let straightHigh = 0;
  if (uniq.length === 5) { if (r[0]! - r[4]! === 4) straightHigh = r[0]!; else if (r.join() === "14,5,4,3,2") straightHigh = 5; }
  const cnt = new Map<number, number>(); r.forEach((x) => cnt.set(x, (cnt.get(x) ?? 0) + 1));
  const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join("");
  const ks = groups.map((g) => g[0]);
  if (straightHigh && flush) return [8, straightHigh];
  if (shape === "41") return [7, ...ks];
  if (shape === "32") return [6, ...ks];
  if (flush) return [5, ...r];
  if (straightHigh) return [4, straightHigh];
  if (shape === "311") return [3, ...ks];
  if (shape === "221") return [2, ...ks];
  if (shape === "2111") return [1, ...ks];
  return [0, ...r];
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };
function brute(cs: CardCode[]): number[] {
  let best: number[] = [-1];
  const n = cs.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const five = cs.filter((_, k) => k !== i && k !== j);
    const r = rank5(five); if (cmp(r, best) > 0) best = r;
  }
  return best;
}
function randomHand(rnd: () => number, n = 7): CardCode[] {
  const d = [...CANONICAL_DECK]; const out: CardCode[] = [];
  for (let i = 0; i < n; i++) out.push(d.splice(Math.floor(rnd() * d.length), 1)[0]!);
  return out;
}
const rng = (seed: number) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2 ** 32; }; };

describe("evaluator", () => {
  it("matches brute-force best-5 ordering on 30000 random 7-card pairs", () => {
    const r = rng(7);
    for (let i = 0; i < 30000; i++) {
      const a = randomHand(r), b = randomHand(r);
      const mine = Math.sign(scoreCodes(a) - scoreCodes(b));
      expect(Math.sign(cmp(brute(a), brute(b)))).toBe(mine);
      expect(category(scoreCodes(a))).toBe(brute(a)[0]);
    }
  });
  it("category edge cases", () => {
    expect(category(scoreCodes(["As", "2d", "3c", "4h", "5s", "9d", "Kc"]))).toBe(CAT.STRAIGHT);
    expect(scoreCodes(["As", "2d", "3c", "4h", "5s", "9d", "Kc"])).toBeLessThan(scoreCodes(["2s", "3d", "4c", "5h", "6s", "9d", "Kc"])); // wheel < 6-high
    expect(category(scoreCodes(["As", "Ks", "Qs", "Js", "Ts", "2d", "2c"]))).toBe(CAT.STRAIGHT_FLUSH);
    expect(category(scoreCodes(["2s", "2h", "2d", "9s", "9h", "9d", "Kc"]))).toBe(CAT.FULL_HOUSE); // two trips
    expect(category(scoreCodes(["2s", "2h", "5d", "5s", "9h", "9d", "Kc"]))).toBe(CAT.TWO_PAIR); // three pairs
    expect(scoreCodes(["As", "Ah", "9d", "9s", "Kh", "2d", "3c"])).toBeGreaterThan(scoreCodes(["As", "Ah", "9d", "9s", "Qh", "2d", "3c"])); // kicker
  });
  it("hand names (SPEC 12.2) and combination order", () => {
    expect(logName(["6h", "8d", "7s", "9c", "5d", "9s", "6c"])).toBe("Straight, 9 High");
    expect(bestFive(["6h", "8d", "7s", "9c", "5d", "9s", "6c"])).toEqual(["5d", "6c", "7s", "8d", "9s"]);
    expect(logName(["5s", "5c", "2c", "2s", "Td", "Kh", "3d"])).toBe("Two Pair, 5's & 2's");
    expect(bestFive(["5s", "5c", "2c", "2s", "Td", "Kh", "3d"]).slice(0, 1)).toEqual(["Kh"]);
    expect(logName(["Ah", "Ac", "7c", "7d", "8h", "2d", "3s"])).toBe("Two Pair, A's & 7's");
    expect(bestFive(["Ah", "Ac", "7c", "7d", "8h", "2d", "3s"])).toEqual(["8h", "7c", "7d", "Ah", "Ac"]);
    expect(logName(["Ks", "Kh", "2c", "7d", "Qd", "5c", "9s"])).toBe("Pair, K's");
    expect(bestFive(["Ks", "Kh", "2c", "7d", "Qd", "5c", "9s"])).toEqual(["7d", "9s", "Qd", "Ks", "Kh"]);
    expect(logName(["As", "2h", "3h", "4h", "5d", "Kc", "9d"])).toBe("Straight, 5 High");
    expect(bestFive(["As", "2h", "3h", "4h", "5d", "Kc", "9d"])[0]).toBe("As");
    expect(logName(["Js", "2s", "3s", "9s", "Ks", "Kh", "9d"])).toBe("Flush, K High");
    expect(chipName(["6s", "6d", "2c", "7d", "Qd", "5c", "9s"])).toBe("pair (6)");
    expect(chipName(["7s", "7d", "4c", "4d", "Qd", "5c", "9s"])).toBe("two pair (7,4)");
    expect(chipName(["As", "7d", "4c", "3d", "Qd", "5c", "9s"])).toBe("high card");
    expect(chipName(["Ts", "Js", "Qs", "Ks", "As", "5c", "9d"])).toBe("royal flush");
    expect(logName(["Ts", "Js", "Qs", "Ks", "As", "5c", "9d"])).toBe("Royal Flush");
  });
});

describe("equity", () => {
  const ent = seededEntropy(5);
  it("exact: AA vs KK preflop is Monte-Carlo ~82% / 18%; exact river and turn", () => {
    tuning.equityRuns = 20000;
    const [a, k] = equity([["As", "Ad"], ["Kh", "Kc"]], [], ent);
    expect(a!).toBeGreaterThan(79); expect(a!).toBeLessThan(85); expect(Math.round((a! + k!) * 100) / 100).toBeCloseTo(100, 1);
    expect(equity([["As", "Ad"], ["Kh", "Kc"]], ["2c", "7d", "9h", "3s", "4d"], ent)).toEqual([100, 0]);
    const t = equity([["As", "Kd"], ["Qh", "Qc"]], ["2c", "7d", "9h", "Qs"], ent); // one card to come, exact
    expect(t[0]).toBe(0); expect(t[1]).toBe(100);
  });
  it("exact enumeration (flop all-in): known flush draw ~ 35%; ties split", () => {
    const e = equity([["Ah", "Kh"], ["Qs", "Qd"]], ["2h", "7h", "9c"], ent); // 2 cards to come: C(45,2)=990 exact
    expect(e[0]!).toBeGreaterThan(53); expect(e[0]!).toBeLessThan(60);
    const tie = equity([["As", "Kd"], ["Ac", "Kh"]], ["2c", "7d", "9h", "3s", "4d"], ent);
    expect(tie).toEqual([50, 50]);
  });
  it("deterministic: same entropy => same Monte-Carlo result", () => {
    tuning.equityRuns = 3000;
    const x = equity([["As", "Ad"], ["Kh", "Kc"], ["7s", "8s"]], [], seededEntropy(9));
    const y = equity([["As", "Ad"], ["Kh", "Kc"], ["7s", "8s"]], [], seededEntropy(9));
    expect(x).toEqual(y);
  });
});
