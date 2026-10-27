import { describe, expect, it } from "vitest";
import { applyDelta, diffFrames, CANONICAL_DECK, isCardCode } from "../src/index.js";
import { parseClientMsg, actionSchema, requestIngressSchema } from "../src/validators.js";
import { fixtures, fixtureNames, fixtureTransitions } from "../src/fixtures/index.js";
import { scriptedEntropy, seededEntropy, fakeClock, stackedDeck, makeFrame } from "../src/testing/index.js";

describe("fixtures", () => {
  it("has the required set", () => {
    expect(fixtureNames.length).toBeGreaterThanOrEqual(30);
  });
  it.each(fixtureNames)("%s is internally consistent", (n) => {
    const f = fixtures[n]!;
    const seated = new Set(f.seats.map(([, id]) => id));
    expect(new Set(f.seats.map(([s]) => s)).size).toBe(f.seats.length);
    for (const id of seated) expect(f.players[id]).toBeDefined();
    expect(f.players[f.table.ownerId]).toBeDefined();
    expect(f.players[f.you!.id]).toBeDefined();
    if (f.hand) {
      for (const id of f.hand.inHandIds) expect(seated.has(id)).toBe(true);
      const codes = [...f.hand.board["1"], ...(f.hand.board["2"] ?? [])];
      for (const c of codes) expect(isCardCode(c)).toBe(true);
      const mine = Object.values(f.cards).flatMap((c) => c.cards.map((s) => s.value)).filter(Boolean) as string[];
      for (const c of [...f.hand.board["1"], ...mine]) expect(CANONICAL_DECK).toContain(c);
      const all = [...f.hand.board["1"], ...mine.filter((_, i) => i >= 0)];
      if (!f.hand.board["2"]) expect(new Set([...f.hand.board["1"], ...mine]).size).toBe(f.hand.board["1"].length + mine.length);
      void all;
    }
    // hidden-card rule: only own cards or showing cards carry values
    for (const [pid, hc] of Object.entries(f.cards)) for (const s of hc.cards) if (s.value && !s.showing) expect(pid === f.you!.id || f.table.godModeIds.includes(f.you!.id)).toBe(true);
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
  it("delta round trips between all pairs", () => {
    for (const a of fixtureNames) for (const b of fixtureNames) {
      const next = fixtures[b]!;
      expect(applyDelta(fixtures[a]!, diffFrames(fixtures[a]!, next) ?? {})).toEqual(next);
    }
    for (const [a, b] of fixtureTransitions) expect(diffFrames(fixtures[a]!, fixtures[b]!)).toBeDefined();
  });
});

describe("testing helpers", () => {
  it("scriptedEntropy serves words then throws", () => {
    const e = scriptedEntropy([0x01020304, 5]);
    expect([...e(4)]).toEqual([1, 2, 3, 4]);
    expect([...e(2)]).toEqual([0, 0]);
    expect(() => e(4)).toThrow();
  });
  it("seededEntropy deterministic; fakeClock; stackedDeck", () => {
    expect([...seededEntropy(1)(16)]).toEqual([...seededEntropy(1)(16)]);
    const c = fakeClock(10); c.advance(5); expect(c.now()).toBe(15);
    const d = stackedDeck(["As", "Kd"]); expect(d.slice(0, 2)).toEqual(["As", "Kd"]); expect(new Set(d).size).toBe(52);
    expect(makeFrame().seats).toHaveLength(1);
  });
});

describe("property: delta/diff on random trees", () => {
  const rnd = seededEntropy(42);
  const r = () => new DataView(rnd(4).buffer).getUint32(0) / 2 ** 32;
  const gen = (depth: number): unknown => {
    if (depth === 0 || r() < 0.3) return r() < 0.3 ? null : r() < 0.5 ? Math.floor(r() * 5) : ["a", "b", "c"][Math.floor(r() * 3)];
    if (r() < 0.25) return Array.from({ length: Math.floor(r() * 3) }, () => gen(depth - 1));
    const o: Record<string, unknown> = {};
    for (const k of ["a", "b", "c", "d"]) if (r() < 0.6) o[k] = gen(depth - 1);
    return o;
  };
  it("applyDelta(a, diff(a,b)) equals b for 2000 random pairs", () => {
    for (let i = 0; i < 2000; i++) {
      const a = { x: gen(4) }, b = { x: gen(4) };
      const d = diffFrames(a, b);
      expect(applyDelta(a, d ?? {})).toEqual(b);
      if (d === undefined) expect(a).toEqual(b);
    }
  });
});

describe("validators", () => {
  it("accepts every action shape and rejects junk", () => {
    const ok = [{ type: "PLAYER_FOLD" }, { type: "PLAYER_RAISE", value: 40 }, { type: "TSG", decision: true }, { type: "SHOW_HAND", cardToShow: "all" }, { type: "SHOW_HAND", cardToShow: "As" }, { type: "RUP" }, { type: "ME", emoji: null }];
    for (const a of ok) expect(actionSchema.safeParse(a).success).toBe(true);
    const bad = [{ type: "PLAYER_RAISE", value: -1 }, { type: "PLAYER_RAISE", value: 1.5 }, { type: "NOPE" }, { type: "SHOW_HAND", cardToShow: "Xx" }, { type: "TOGGLE_MUTE_PLAYER", otherPlayerID: "short" }, {}];
    for (const a of bad) expect(actionSchema.safeParse(a).success).toBe(false);
  });
  it("parseClientMsg rejects malformed and oversize input", () => {
    expect(parseClientMsg("not json")).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: "ping", ts: 1 }))).not.toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: "chat", text: "x".repeat(5000) }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: "action", action: { type: "PLAYER_FOLD" } }))).not.toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: "bogus" }))).toBeNull();
  });
  it("requestIngress schema is defined", () => { expect(requestIngressSchema).toBeDefined(); });
});

describe("Frame field coverage (every field exercised by at least one fixture)", () => {
  const paths = (v: unknown, prefix: string, out: Set<string>) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) { if (v.length) out.add(prefix); return; }
    if (typeof v === "object") {
      const keys = Object.keys(v as object);
      if (!keys.length) return;
      // record-keyed maps: collapse dynamic keys
      for (const k of keys) paths((v as Record<string, unknown>)[k], (/^(players|result|bets|playerStatus|bankMs|ritVotes|requests)$/.test(prefix.split(".").pop()!) || prefix === ".cards") ? `${prefix}.*` : `${prefix}.${k}`, out);
      return;
    }
    out.add(prefix);
  };
  const seen = new Set<string>();
  for (const f of Object.values(fixtures)) paths(f, "", seen);
  const required = [
    "meta.id", "meta.now", "meta.pre", "meta.sN", "meta.version", "meta.mEV",
    "table.status", "table.ownerId", "table.pausedAt", "table.stopQueued", "table.handNumber", "table.configQueued", "table.nextBlindAt", "table.nextBlind.sb", "table.nextBlind.ante",
    "table.spectatorMode", "table.godModeIds", "table.waitingMessage", "table.blinds.level", "table.spectatorCount", "table.config.antes", "table.config.blindLevels",
    "seats", "players.*.status", "players.*.stack", "players.*.winCount", "players.*.quitCount", "players.*.intendedSeat", "players.*.requestedStack", "players.*.away", "players.*.quitNextHand",
    "players.*.disconnectedSince", "players.*.spectator", "players.*.allowSpectator", "players.*.rebuyCount", "players.*.emoji",
    "hand.handNumber", "hand.handId", "hand.commitment", "hand.dealerSeat", "hand.deadButton", "hand.dealerId", "hand.smallBlindId", "hand.bigBlindId", "hand.straddleId", "hand.inHandIds",
    "hand.playerStatus.*", "hand.street.run", "hand.street.stage", "hand.runs", "hand.board.1", "hand.board.2", "hand.pot", "hand.bets.*", "hand.highestBet", "hand.minRaise", "hand.maxBet",
    "hand.optionIds", "hand.noReraiseIds", "hand.directToNext", "hand.winningBoardCards",
    "turn.playerId", "turn.taking", "turn.actionStartedAt", "turn.deadlineNoBank", "turn.deadlineWithBank", "turn.nextStep", "turn.nextStepAt", "turn.bankMs.*", "turn.ritWaiting", "turn.ritVotes.*",
    "turn.rebuyPromptIds", "turn.rebuy.phase", "turn.rebuy.deadlineAt", "turn.rebuy.requests.*", "turn.offlineLimitAt",
    "cards.*.cards", "cards.*.name1", "cards.*.name2", "cards.*.name1RH", "cards.*.prob1",
    "result.*.runs.1.hc", "result.*.runs.2.hc", "result.*.runs.1.winning", "result.*.gained",
    "rabbit.enabled", "rabbit.hunters", "rabbit.cards.1", "you.id", "you.name", "you.mutedIds", "you.straddling", "you.isOwner"
  ];
  it.each(required)("%s", (p) => { expect(seen.has("." + p), p).toBe(true); });
  it("bigBlindChecked true appears (BB option check done)", () => {
    expect(Object.values(fixtures).some((f) => f.hand?.bigBlindChecked === true)).toBe(true);
  });
});
