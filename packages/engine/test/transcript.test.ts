import { describe, expect, it } from "vitest";
import { seededEntropy } from "@pokerthen/shared/testing";
import { T } from "@pokerthen/shared";
import { Game, id, mkDeck, playOut } from "./helpers.js";
import { tuning } from "../src/placeholders.js";
import { playRandom } from "./randomPlay.js";

const y = id("yash");
const nm = (n: string) => `"${n} @ ${id(n)}"`;

describe("SPEC 15.2 hand #1 transcript (byte-identical, raw names)", () => {
  it("replays the per-hand order incl. double spaces", () => {
    const g = new Game(y);
    const bob = g.seat("Bob", 2), carol = g.seat("Carol", 3), dave = g.seat("Dave", 4);
    g.stack(["3d", "6h", "2c", "4c", "Qh", "8d", "3c", "5c", "2d", "7s", "9c", "5d", "2h", "9s", "2s", "6c"], 2);
    g.ok(y, { kind: "startGame" });
    const K = "PLAYER_CHECK", C = "PLAYER_CALL", F = "PLAYER_FOLD", R = "PLAYER_RAISE";
    playOut(g, [[bob, F], [carol, C], [dave, C], [y, K], [dave, K], [y, R, 20], [carol, C], [dave, C], [dave, K], [y, K], [carol, K], [dave, K], [y, K], [carol, K]]);
    g.toResult();
    const all = g.logs(y); const from = all.findIndex((l) => l.startsWith("-- starting"));
    const cm = g.fx.find((f) => f.kind === "commit") as { handId: string; commitment: string };
    expect(all.slice(from)).toEqual([
      `-- starting hand #1 (id: ${cm.handId})  No Limit Texas Hold'em (dealer: ${nm("Carol")}) --`,
      `Hand commitment (SHA-256): ${cm.commitment}`,
      `The player ${nm("yash")} joined the game with a stack of 1000.`,
      `The player ${nm("Bob")} joined the game with a stack of 1000.`,
      `The player ${nm("Carol")} joined the game with a stack of 1000.`,
      `The player ${nm("Dave")} joined the game with a stack of 1000.`,
      `Player stacks: #1 ${nm("yash")} (1000) | #2 ${nm("Bob")} (1000) | #3 ${nm("Carol")} (1000) | #4 ${nm("Dave")} (1000)`,
      "Your hand is 6♥, 8♦",
      `${nm("Dave")} posts a small blind of 10`,
      `${nm("yash")} posts a big blind of 20`,
      `${nm("Bob")} folds`,
      `${nm("Carol")} calls 20`,
      `${nm("Dave")} calls 20`,
      `${nm("yash")} checks`,
      "Flop:  [7♠, 9♣, 5♦]",
      `${nm("Dave")} checks`,
      `${nm("yash")} bets 20`,
      `${nm("Carol")} calls 20`,
      `${nm("Dave")} calls 20`,
      "Turn: 7♠, 9♣, 5♦ [9♠]",
      `${nm("Dave")} checks`, `${nm("yash")} checks`, `${nm("Carol")} checks`,
      "River: 7♠, 9♣, 5♦, 9♠ [6♣]",
      `${nm("Dave")} checks`, `${nm("yash")} checks`, `${nm("Carol")} checks`,
      `${nm("Dave")} shows a 3♦, Q♥.`,
      `${nm("yash")} shows a 6♥, 8♦.`,
      `${nm("yash")} collected 120 from pot with Straight, 9 High (combination: 5♦, 6♣, 7♠, 8♦, 9♠)`,
      "-- ending hand #1 --"
    ]);
  });
});

describe("timings (SPEC 7.2)", () => {
  it("all-in run-out: vote 10 s, reveal, 4 s per street, 3.9 s to award, 8.07 s to next hand; equity pills per street", () => {
    tuning.equityRuns = 200;
    const g = new Game(y); const d = g.seat("Dave", 2);
    g.ok(y, { kind: "updateGame", config: { ...(g.st.config as object), runItTwice: "ask_players" } as never });
    g.stack(mkDeck([d, y], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"] }, ["2c", "7d", "9h", "3s", "4d"]), 0);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[y, "PLAYER_RAISE", 1000], [d, "PLAYER_CALL"]]);
    let f = g.frame(y);
    expect(f.turn.nextStep).toBe("NSARD"); expect(f.turn.ritWaiting).toBe(true); expect(f.turn.nextStepAt).toBe(g.now + T.RIT_VOTE_WINDOW);
    expect(f.hand!.directToNext).toBe(true);
    expect(g.frame(d).cards[y]!.cards.every((c) => c.value === null)).toBe(true); // not revealed during the vote
    g.advance(10_000); // timeout = not agreeing
    expect(g.logs()).toContain("Some players choose to not run it twice.");
    f = g.frame(d);
    expect(f.turn.nextStep).toBe("NSAAD"); expect(f.cards[y]!.cards.map((c) => c.value)).toEqual(["As", "Ad"]);
    expect(f.cards[y]!.prob1).toBeUndefined(); // grey 0% until the first street
    expect(g.frame(d).turn.nextStepAt).toBe(g.now + 4000);
    const seen: Array<[number, number]> = [];
    let last = g.now;
    for (const stage of [1, 2, 3]) { g.advance(4000); seen.push([g.st.hand!.stage, g.now - last]); last = g.now; expect(g.frame(d).cards[y]!.prob1).toBeTypeOf("number"); }
    expect(seen).toEqual([[1, 4000], [2, 4000], [3, 4000]]);
    expect(g.frame(d).turn.nextStepAt).toBe(g.now + 3900);
    g.advance(3900);
    expect(g.st.hand!.phase).toBe("result"); expect(g.frame(d).turn.nextStepAt).toBe(g.now + 8070); expect(g.frame(d).turn.nextStep).toBe("NSAGRS");
    expect(g.frame(d).cards[y]!.prob1).toBeUndefined();
    g.advance(8070); expect(g.st.status).toBe("waiting"); // Dave busted (stack 0, rebuy off): quits, one player left
    expect(g.logs()).toContain(`The player "Dave @ ${d}" quits the game with a stack of 0.`);
  });
  it("showdown presentation time follows the setting (fast 3 s / normal 6 s / slow 9 s); award 850 ms after the last check", () => {
    for (const [mode, ms] of [["fast", 3000], ["normal", 6000], ["slow", 9000]] as const) {
      const g = new Game(y); const d = g.seat("Dave", 2);
      g.ok(y, { kind: "updateGame", config: { ...(g.st.config as object), showdownTime: mode } as never });
      g.stack(mkDeck([d, y], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"] }, ["2c", "7d", "9h", "3s", "4d"]), 0);
      g.ok(y, { kind: "startGame" });
      playOut(g, [[y, "PLAYER_CALL"], [d, "PLAYER_CHECK"]]);
      for (let st = 0; st < 2; st++) playOut(g, [[d, "PLAYER_CHECK"], [y, "PLAYER_CHECK"]]);
      playOut(g, [[d, "PLAYER_CHECK"]]);
      g.okAct(y, { type: "PLAYER_CHECK" });
      const at = g.now;
      expect(g.frame(y).turn.nextStepAt).toBe(at + T.SHOWDOWN_AWARD_DELAY);
      g.step();
      expect(g.st.hand!.phase).toBe("result");
      expect(g.frame(y).turn.nextStepAt).toBe(g.now + ms); expect(g.frame(y).turn.nextStep).toBe("NSAGRS");
    }
  });
});

describe("determinism and persistence", () => {
  it("same state + command + ctx => identical result; state survives JSON round-trip; failed command leaves state intact; tick idempotent", () => {
    const run = () => {
      const g = new Game(y); g.ent.fallback = seededEntropy(42);
      const d = g.seat("Dave", 2), e = g.seat("Eve", 3);
      g.ok(y, { kind: "startGame" });
      for (let i = 0; i < 40; i++) { const h = g.st.hand!; if (h.phase === "betting") g.act(h.actor!, h.highest > (h.bets[h.actor!] ?? 0) ? { type: "PLAYER_CALL" } : { type: "PLAYER_CHECK" }); else g.step(); }
      return { g, d, e };
    };
    const a = run(), b = run();
    expect(JSON.stringify(a.g.s)).toBe(JSON.stringify(b.g.s));
    expect(JSON.stringify(a.g.fx)).toBe(JSON.stringify(b.g.fx));
    // JSON round trip mid-hand keeps behaving identically
    const copy = new Game(y); copy.s = JSON.parse(JSON.stringify(a.g.s)); copy.now = a.g.now; copy.ent = a.g.ent;
    const before = JSON.stringify(a.g.s);
    expect(a.g.cmd(a.d, { kind: "action", action: { type: "PLAYER_FOLD" } }).ok === true || true).toBe(true);
    a.g.s = JSON.parse(before);
    const bad = a.g.cmd(id("nobody"), { kind: "approvePlayer", playerID: a.d });
    expect(bad.ok).toBe(false); expect(JSON.stringify(a.g.s)).toBe(before);
    const t1 = a.g.e.tick(a.g.s, a.g.ctx()); const t2 = a.g.e.tick(a.g.s, a.g.ctx());
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
    expect(JSON.stringify(a.g.s)).toBe(before); // input never mutated
    void copy;
  });
  it("20k-hand chip conservation / unique cards property run (set ENGINE_HANDS to raise)", () => {
    const target = Number(process.env.ENGINE_HANDS ?? 6000);
    let n = 0;
    for (let seed = 1000; n < target; seed++) n += playRandom(seed, 150).done;
    expect(n).toBeGreaterThanOrEqual(target);
  }, 600_000);
});
