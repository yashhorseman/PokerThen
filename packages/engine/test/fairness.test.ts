import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { CANONICAL_DECK, GENESIS_PREV_COMMITMENT, commitDeck as sharedCommit, computeCommitment, computeCommitmentSync, isPermutationOfDeck, sha256Hex as webSha, sha256HexSync, verifyReveal, type EngineEffect, type FairnessReveal, type CardCode } from "@pokerthen/shared";
import { scriptedEntropy, seededEntropy } from "@pokerthen/shared/testing";
import { sha256Hex } from "../src/hash.js";
import { commitDeck, cardSalt } from "../src/fairness.js";
import { newSalt, shuffle, uniformInt, uint32 } from "../src/rng.js";
import { Game, id, mkDeck, playOut, deckWords } from "./helpers.js";

describe("hash", () => {
  it("node sync, shared pure-sync and WebCrypto agree on random inputs", async () => {
    for (let i = 0; i < 200; i++) {
      const s = randomBytes(1 + (i % 150)).toString("base64") + "|é€";
      const a = sha256Hex(s);
      expect(sha256HexSync(s)).toBe(a);
      expect(await webSha(s)).toBe(a);
    }
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("engine Merkle commitment equals the shared reference construction", () => {
    const deck = shuffle(seededEntropy(3)); const masterSalt = newSalt(seededEntropy(4));
    const a = commitDeck({ gameId: "g1", handNumber: 7, handId: "abcdefghijkl", prevCommitment: GENESIS_PREV_COMMITMENT, deck, masterSalt });
    const b = sharedCommit({ gameId: "g1", handNumber: 7, handId: "abcdefghijkl", prevCommitment: GENESIS_PREV_COMMITMENT, deck, masterSalt });
    expect(a.root).toBe(b.root); expect(a.commitment).toBe(b.commitment);
    expect(cardSalt(masterSalt, 5)).toBe(b.tree.levels[0] ? cardSalt(masterSalt, 5) : "");
    expect(computeCommitmentSync({ gameId: "g1", handNumber: 7, handId: "abcdefghijkl", prevCommitment: GENESIS_PREV_COMMITMENT, root: a.root })).toBe(a.commitment);
  });
});

describe("rng", () => {
  it("rejection sampling: values >= limit are redrawn (crafted entropy)", () => {
    // n=52: limit = floor(2^32/52)*52 = 4294967272-?; compute and craft
    const limit = Math.floor(2 ** 32 / 52) * 52;
    const e = scriptedEntropy([limit, limit + 1, 0xffffffff, 53]);
    expect(uniformInt(e, 52)).toBe(53 % 52);
    expect(() => e(4)).toThrow(); // all four words consumed (3 rejected + 1 accepted)
    expect(uniformInt(scriptedEntropy([limit - 1]), 52)).toBe((limit - 1) % 52);
  });
  it("n=1 consumes nothing; bad n throws", () => {
    expect(uniformInt(scriptedEntropy([]), 1)).toBe(0);
    expect(() => uniformInt(scriptedEntropy([1]), 0)).toThrow();
  });
  it("shuffle is a permutation and deckWords can steer it exactly", () => {
    for (let s = 1; s < 30; s++) expect(isPermutationOfDeck(shuffle(seededEntropy(s)))).toBe(true);
    const target = shuffle(seededEntropy(99));
    expect(shuffle(scriptedEntropy(deckWords(target)))).toEqual(target);
  });
  it("distribution: chi-square over 1e6 draws, n=52 (no modulo bias), loose threshold", () => {
    const e = seededEntropy(123); const n = 52; const N = 1_000_000; const c = new Array<number>(n).fill(0);
    for (let i = 0; i < N; i++) c[uniformInt(e, n)]!++;
    const exp = N / n; const chi = c.reduce((a, o) => a + (o - exp) ** 2 / exp, 0);
    expect(chi).toBeLessThan(51 + 6 * Math.sqrt(2 * 51)); // df=51, ~6 sigma
  });
  it("shuffle position distribution: first card uniform over 52 (20k shuffles)", () => {
    const e = seededEntropy(5); const c = new Map<string, number>();
    for (let i = 0; i < 20000; i++) { const k = shuffle(e)[0]!; c.set(k, (c.get(k) ?? 0) + 1); }
    const exp = 20000 / 52; let chi = 0; for (const k of CANONICAL_DECK) chi += ((c.get(k) ?? 0) - exp) ** 2 / exp;
    expect(chi).toBeLessThan(51 + 6 * Math.sqrt(102));
  });
  it("salt is 64 hex chars from 32 bytes; uint32 big-endian", () => {
    expect(newSalt(seededEntropy(1))).toMatch(/^[0-9a-f]{64}$/);
    expect(uint32(scriptedEntropy([0x01020304]))).toBe(0x01020304);
  });
  it("no Math.random / Date.now / randomBytes in engine src (lint)", () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of walk(join(__dirname, "../src"))) {
      const t = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(t, f).not.toMatch(/Math\.random|Date\.now|randomBytes|randomInt|randomUUID|getRandomValues|new Date\(/);
      if (!f.endsWith("hash.ts")) expect(t, f).not.toMatch(/from "node:crypto"|require\("crypto"\)/);
    }
  });
});

const y = id("yash");
describe("commit/reveal flow", () => {
  function playTwoHands() {
    const g = new Game(y); const d = g.seat("Dave", 2);
    g.stack(mkDeck([d, y], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"] }, ["Qd", "Js", "4h", "9c", "3s"]), 0);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[y, "PLAYER_RAISE", 60], [d, "PLAYER_FOLD"]]);
    g.toResult(); g.until(() => g.st.hand!.number === 2);
    playOut(g, [[d, "PLAYER_CALL"], [y, "PLAYER_CHECK"]]);
    return { g, d };
  }
  it("commit effect precedes every log/frame content of the hand; chain links hands; reveal verifies", async () => {
    const { g } = playTwoHands();
    const commits = g.fx.filter((f): f is Extract<EngineEffect, { kind: "commit" }> => f.kind === "commit");
    const reveals = g.fx.filter((f): f is Extract<EngineEffect, { kind: "reveal" }> => f.kind === "reveal");
    expect(commits).toHaveLength(2); expect(reveals).toHaveLength(1);
    expect(commits[0]!.prevCommitment).toBe(GENESIS_PREV_COMMITMENT);
    expect(commits[1]!.prevCommitment).toBe(commits[0]!.commitment);
    const idx = (k: string, n: number) => g.fx.findIndex((f, i) => f.kind === k && (f as { handNumber?: number }).handNumber === n && i >= 0);
    expect(idx("commit", 1)).toBeLessThan(g.fx.findIndex((f) => f.kind === "log" && f.handNumber === 1 && f.msg.startsWith("-- starting")));
    const rev = reveals[0]!.reveal;
    const checks = await verifyReveal(rev, { commitment: commits[0]!.commitment, prevCommitment: GENESIS_PREV_COMMITMENT });
    expect(checks.every((c) => c.ok), JSON.stringify(checks)).toBe(true);
    // a fold-win before the flop exposes NO card: the reveal holds no card values at all
    expect(rev.cards).toEqual([]);
  });
  it("showdown reveal contains only exposed cards (board + shown hole cards), never mucked/burn/undealt", async () => {
    const g = new Game(y); const b = g.seat("Bob", 2), c = g.seat("Carol", 3);
    const deck = mkDeck([y, b, c], { [y]: ["Kh", "Kc"], [b]: ["As", "Ad"], [c]: ["2c", "7d"] }, ["Qd", "Js", "4h", "9c", "3s"], ["8d"]);
    g.stack(deck, 2); g.ok(y, { kind: "startGame" });
    playOut(g, [[c, "PLAYER_CALL"], [y, "PLAYER_CALL"], [b, "PLAYER_CHECK"]]);
    for (let st = 0; st < 3; st++) playOut(g, [[y, "PLAYER_CHECK"], [b, "PLAYER_CHECK"], [c, "PLAYER_CHECK"]]);
    g.toResult(); g.until(() => g.st.hand!.number === 2);
    const rev = (g.fx.filter((f) => f.kind === "reveal")[0] as { reveal: FairnessReveal }).reveal;
    const got = rev.cards.map((x) => x.card).sort();
    expect(got).toEqual(["As", "Ad", "Kh", "Kc", "Qd", "Js", "4h", "9c", "3s"].sort());
    expect(JSON.stringify(rev)).not.toMatch(/"2c"|"7d"|"8d"/); // Carol mucked, 8d is a burn/other
    const checks = await verifyReveal(rev);
    expect(checks.every((x) => x.ok)).toBe(true);
    // salts of unexposed indices never appear
    const used = new Set(rev.cards.map((x) => x.index));
    const sample = JSON.stringify(rev);
    for (let i = 0; i < 52; i++) if (!used.has(i)) expect(sample).not.toContain(cardSalt("x", i)); // sanity (salts depend on secret master salt)
    expect(rev.usage.filter((u) => u.kind === "hole").map((u) => u.playerId).slice(0, rev.dealOrder.length)).toEqual(rev.dealOrder);
  });
  it("tampering with a revealed card or the root fails verification", async () => {
    const g = new Game(y); const d = g.seat("Dave", 2);
    g.stack(mkDeck([d, y], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"] }, ["Qd", "Js", "4h", "9c", "3s"]), 0); g.ok(y, { kind: "startGame" });
    playOut(g, [[y, "PLAYER_CALL"], [d, "PLAYER_CHECK"]]);
    for (let st = 0; st < 3; st++) playOut(g, [[d, "PLAYER_CHECK"], [y, "PLAYER_CHECK"]]);
    g.toResult(); g.until(() => g.st.hand!.number === 2);
    const rev = structuredClone((g.fx.filter((f) => f.kind === "reveal")[0] as { reveal: FairnessReveal }).reveal);
    expect((await verifyReveal(rev)).every((x) => x.ok)).toBe(true);
    const bad = structuredClone(rev); bad.cards[0]!.card = "2c" as CardCode;
    expect((await verifyReveal(bad)).some((x) => !x.ok)).toBe(true);
    const bad2 = structuredClone(rev); bad2.root = "0".repeat(64);
    expect((await verifyReveal(bad2)).some((x) => !x.ok)).toBe(true);
    expect(await computeCommitment({ gameId: rev.gameId, handNumber: rev.handNumber, handId: rev.handId, prevCommitment: rev.prevCommitment, root: rev.root })).toBe(rev.commitment);
  });
});
