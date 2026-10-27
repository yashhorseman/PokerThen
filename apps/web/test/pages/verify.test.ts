import { describe, expect, it } from "vitest";
import {
  CANONICAL_DECK, GENESIS_PREV_COMMITMENT, cardSalt, commitDeck, revealCard,
  type CardCode, type FairnessRecord, type FairnessReveal
} from "@pokerthen/shared";
import { checkChain, parseCardToken, parseGameRef, parseHandLog, verifyHand } from "../../src/pages/verify/check";

const GAME = "ptlTESTGAME0000000000000";
const SALT = "ab".repeat(32);
const deck: CardCode[] = [...CANONICAL_DECK].reverse(); // any fixed permutation

function makeHand(handNumber: number, prev: string, expose: number[], d: CardCode[] = deck) {
  const handId = "jxmorahjxvq" + handNumber;
  const com = commitDeck({ gameId: GAME, handNumber, handId, prevCommitment: prev, deck: d, masterSalt: SALT });
  const reveal: FairnessReveal = {
    gameId: GAME, handNumber, handId, commitment: com.commitment, prevCommitment: prev, root: com.root,
    dealOrder: ["pA", "pB"],
    usage: [
      { kind: "hole", run: 1, street: 0, playerId: "pA", indices: [0, 2] },
      { kind: "hole", run: 1, street: 0, playerId: "pB", indices: [1, 3] },
      { kind: "burn", run: 1, street: 1, indices: [4] },
      { kind: "board", run: 1, street: 1, indices: [5, 6, 7] },
      { kind: "burn", run: 1, street: 2, indices: [8] },
      { kind: "board", run: 1, street: 2, indices: [9] }
    ],
    cards: expose.map((i) => revealCard(com, d, SALT, i)),
    revealedAtMs: 2000
  };
  const record: FairnessRecord = { commitment: com.commitment, prevCommitment: prev, root: com.root, committedAtMs: 1000, reveal };
  return { record, com, handId, d };
}
const show = (c: CardCode) => c[0] === "T" ? "10" + ({ s: "♠", h: "♥", d: "♦", c: "♣" } as const)[c[1] as "s"] : c[0] + ({ s: "♠", h: "♥", d: "♦", c: "♣" } as const)[c[1] as "s"];
const logFor = (h: ReturnType<typeof makeHand>) => [
  `-- starting hand #1 (id: ${h.handId})  No Limit Texas Hold'em (dealer: "A @ pA") --`,
  `Hand commitment (SHA-256): ${h.record.commitment}`,
  `Your hand is ${show(h.d[0]!)}, ${show(h.d[2]!)}`,
  `Flop:  [${[5, 6, 7].map((i) => show(h.d[i]!)).join(", ")}]`,
  `Turn: ${[5, 6, 7].map((i) => show(h.d[i]!)).join(", ")} [${show(h.d[9]!)}]`,
  `"B @ pB" shows a ${show(h.d[1]!)}, ${show(h.d[3]!)}.`,
  "-- ending hand #1 --"
];

describe("/verify checks (FAIRNESS-MERKLE 9)", () => {
  const exposed = [1, 3, 5, 6, 7, 9];
  it("PASS on an honest revealed hand incl. log comparison", () => {
    const h = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    const v = verifyHand({ gameId: GAME, handNumber: 1, record: h.record, logLines: logFor(h) });
    expect(v.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(v.overall).toBe("PASS");
    expect(v.checks.find((c) => c.id === "proofs")?.status).toBe("pass");
    expect(v.checks.find((c) => c.id === "log-board")?.status).toBe("pass");
    // unexposed values never appear in the reveal
    const json = JSON.stringify(h.record.reveal);
    for (const i of [0, 2, 4, 8]) { expect(json).not.toContain(cardSalt(SALT, i)); }
  });
  it("PASS without a log (log checks skipped), chained to hand 1", () => {
    const h1 = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    const h2 = makeHand(2, h1.record.commitment, [5, 6, 7]);
    const v = verifyHand({ gameId: GAME, handNumber: 2, record: h2.record, prevRecord: h1.record });
    expect(v.overall).toBe("PASS");
    expect(v.checks.find((c) => c.id === "log-commit")?.status).toBe("skip");
    expect(v.checks.find((c) => c.id === "chain")?.status).toBe("pass");
  });
  it("FAIL when a revealed card is tampered", () => {
    const h = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    h.record.reveal!.cards[2]!.card = "As";
    const v = verifyHand({ gameId: GAME, handNumber: 1, record: h.record });
    expect(v.overall).toBe("FAIL");
    expect(v.checks.find((c) => c.id === "proofs")?.status).toBe("fail");
  });
  it("FAIL when a salt is tampered", () => {
    const h = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    h.record.reveal!.cards[0]!.salt = "cd".repeat(32);
    expect(verifyHand({ gameId: GAME, handNumber: 1, record: h.record }).overall).toBe("FAIL");
  });
  it("FAIL when the deck is swapped after the commitment (different root)", () => {
    const h = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    const other = makeHand(1, GENESIS_PREV_COMMITMENT, exposed, [...CANONICAL_DECK]);
    const forged: FairnessRecord = { ...h.record, reveal: { ...other.record.reveal!, commitment: h.record.commitment, root: other.record.root } };
    const v = verifyHand({ gameId: GAME, handNumber: 1, record: forged });
    expect(v.overall).toBe("FAIL");
  });
  it("FAIL when the log shows another commitment, or cards that are not proven", () => {
    const h = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    const lines = logFor(h); lines[1] = `Hand commitment (SHA-256): ${"0".repeat(64)}`;
    expect(verifyHand({ gameId: GAME, handNumber: 1, record: h.record, logLines: lines }).checks.find((c) => c.id === "log-commit")?.status).toBe("fail");
    const lines2 = logFor(h); lines2[3] = "Flop:  [2♠, 3♠, 4♠]";
    expect(verifyHand({ gameId: GAME, handNumber: 1, record: h.record, logLines: lines2 }).checks.find((c) => c.id === "log-board")?.status).toBe("fail");
  });
  it("FAIL when commitment logged after the hand started", () => {
    const h = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    const lines = logFor(h); [lines[1], lines[2]] = [lines[2]!, lines[1]!];
    expect(verifyHand({ gameId: GAME, handNumber: 1, record: h.record, logLines: lines }).checks.find((c) => c.id === "log-commit")?.status).toBe("fail");
  });
  it("FAIL on a broken chain; PENDING before reveal", () => {
    const h1 = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    const h2 = makeHand(2, "f".repeat(64), exposed);
    expect(verifyHand({ gameId: GAME, handNumber: 2, record: h2.record, prevRecord: h1.record }).overall).toBe("FAIL");
    const pending = { ...h1.record, reveal: null };
    expect(verifyHand({ gameId: GAME, handNumber: 1, record: pending }).overall).toBe("PENDING");
  });
  it("FAIL when one deck index is revealed twice with different values", () => {
    const h = makeHand(1, GENESIS_PREV_COMMITMENT, exposed);
    h.record.reveal!.cards.push({ ...h.record.reveal!.cards[0]!, card: "Kd" });
    expect(verifyHand({ gameId: GAME, handNumber: 1, record: h.record }).checks.find((c) => c.id === "cards")?.status).toBe("fail");
  });
  it("chain check across hands", () => {
    const h1 = makeHand(1, GENESIS_PREV_COMMITMENT, []); const h2 = makeHand(2, h1.record.commitment, []); const h3 = makeHand(3, h2.record.commitment, []);
    expect(checkChain([h1.record, h2.record, h3.record]).ok).toBe(true);
    expect(checkChain([h1.record, h3.record])).toMatchObject({ ok: false, brokenAt: 2 });
  });
});

describe("helpers", () => {
  it("parses card tokens and game refs", () => {
    expect(parseCardToken("10♥")).toBe("Th");
    expect(parseCardToken("Q♠")).toBe("Qs");
    expect(parseCardToken("x")).toBeNull();
    expect(parseGameRef("https://pokerthen.example/games/ptlAbC_12-x?y=1")).toBe("ptlAbC_12-x");
    expect(parseGameRef("ptlabc")).toBe("ptlabc");
    expect(parseGameRef("")).toBeNull();
    expect(parseHandLog(["Flop:  [7♠, 9♣, 5♦]"]).board).toEqual(["7s", "9c", "5d"]);
  });
});
