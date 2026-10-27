import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { applyDelta, diffFrames, CANONICAL_DECK, computeCommitment, verifyReveal, cardText, defaultGameConfig, commitDeck, revealCard, cardSalt, computeLeaf, foldProof, sha256Hex, sha256HexSync, GENESIS_PREV_COMMITMENT, type FairnessReveal } from "../src/index.js";

describe("delta", () => {
  it("merges objects, replaces arrays, deletes with <D>", () => {
    const base = { a: { x: 1, y: [1, 2] }, b: 2 };
    const out = applyDelta(base, { a: { y: [3] }, b: "<D>" });
    expect(out).toEqual({ a: { x: 1, y: [3] } });
    expect(base.b).toBe(2);
  });
  it("diff round trips", () => {
    const prev = { a: { x: 1, z: { q: 1 } }, l: [1, 2], k: 1 };
    const next = { a: { x: 2, z: { q: 1 } }, l: [1, 2, 3], n: { m: 1 } } as Record<string, unknown>;
    const d = diffFrames(prev, next);
    expect(applyDelta(prev, d)).toEqual(next);
    expect(diffFrames(prev, prev)).toBeUndefined();
  });
});

describe("cards", () => {
  it("canonical deck", () => {
    expect(CANONICAL_DECK).toHaveLength(52);
    expect(new Set(CANONICAL_DECK).size).toBe(52);
    expect(cardText("Ts")).toBe("10♠");
  });
});

describe("fairness (Merkle)", () => {
  const gameId = "ptlx", handNumber = 1, handId = "h1";
  const deck = [...CANONICAL_DECK].reverse();
  const masterSalt = "ab".repeat(32);
  const mk = () => {
    const c = commitDeck({ gameId, handNumber, handId, prevCommitment: GENESIS_PREV_COMMITMENT, deck, masterSalt });
    const idx = [3, 0, 51, 17];
    const rev: FairnessReveal = { gameId, handNumber, handId, commitment: c.commitment, prevCommitment: GENESIS_PREV_COMMITMENT, root: c.root, dealOrder: [], usage: [], cards: idx.map((i) => revealCard(c, deck, masterSalt, i)), revealedAtMs: 0 };
    return { c, rev };
  };
  it("sync sha256 matches node:crypto and WebCrypto", async () => {
    for (const t of ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000), "é♠"]) {
      expect(sha256HexSync(t)).toBe(createHash("sha256").update(t).digest("hex"));
      expect(await sha256Hex(t)).toBe(sha256HexSync(t));
    }
  });
  it("async and sync commitment agree; all-index proofs verify", async () => {
    const { c, rev } = mk();
    expect(await computeCommitment({ gameId, handNumber, handId, prevCommitment: GENESIS_PREV_COMMITMENT, root: c.root })).toBe(c.commitment);
    for (let i = 0; i < 52; i++) {
      const r = revealCard(c, deck, masterSalt, i);
      expect(foldProof(computeLeaf(gameId, handNumber, handId, i, r.card, r.salt), i, r.proof)).toBe(c.root);
    }
    expect((await verifyReveal(rev, { commitment: c.commitment, prevCommitment: null })).every((x) => x.ok)).toBe(true);
  });
  it("detects tampered card, salt, proof, root, chain", async () => {
    const { rev } = mk();
    const bad = (m: Partial<FairnessReveal>) => verifyReveal({ ...rev, ...m });
    const okOf = (cs: { id: string; ok: boolean }[], id: string) => cs.find((x) => x.id === id)!.ok;
    expect(okOf(await bad({ cards: [{ ...rev.cards[0]!, card: "As" }, ...rev.cards.slice(1)] }), "proofs")).toBe(false);
    expect(okOf(await bad({ cards: [{ ...rev.cards[0]!, salt: "00".repeat(32) }, ...rev.cards.slice(1)] }), "proofs")).toBe(false);
    expect(okOf(await bad({ cards: [{ ...rev.cards[0]!, proof: rev.cards[1]!.proof }, ...rev.cards.slice(1)] }), "proofs")).toBe(false);
    expect(okOf(await bad({ root: "11".repeat(32) }), "proofs")).toBe(false);
    expect(okOf(await bad({ prevCommitment: "22".repeat(32) }), "hash")).toBe(false);
    expect(okOf(await bad({ cards: [...rev.cards, { ...rev.cards[0]!, card: "2c" }] }), "cards")).toBe(false);
    expect(okOf(await verifyReveal(rev, { prevCommitment: "33".repeat(32) }), "chain")).toBe(false);
  });
  it("reveal contains no unexposed card or salt", () => {
    const { rev } = mk();
    const json = JSON.stringify(rev);
    const shown = new Set(rev.cards.map((r) => r.index));
    for (let i = 0; i < 52; i++) if (!shown.has(i)) expect(json).not.toContain(cardSalt(masterSalt, i));
    expect(json).not.toContain(masterSalt);
  });
});

describe("config", () => {
  it("defaults match SPEC 10", () => {
    const c = defaultGameConfig();
    expect(c.decisionLimitSec).toBe(20);
    expect(c.timeBankSec).toBe(10);
    expect(c.autoDeal).toBe(true);
    expect(c.showdownTime).toBe("normal");
  });
});
