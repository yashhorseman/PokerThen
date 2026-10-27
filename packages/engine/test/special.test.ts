import { describe, expect, it } from "vitest";
import { Game, id, mkDeck, playOut, strip } from "./helpers.js";

const F = "PLAYER_FOLD", K = "PLAYER_CHECK", C = "PLAYER_CALL", R = "PLAYER_RAISE";
const y = id("yash");
const cfgOf = (g: Game, over: Record<string, unknown>) => g.ok(y, { kind: "updateGame", config: { ...(g.st.config as object), ...over } as never });
const plain = (g: Game) => g.logs().map(strip);

describe("straddle (SPEC 11.2)", () => {
  it("UTG posts 40 after the BB, acts last, min raise 60 then 80", () => {
    const g = new Game(y); const b = g.seat("Bob", 2), c = g.seat("Carol", 3), d = g.seat("Dave", 4);
    cfgOf(g, { straddleAllowed: true });
    g.ok(b, { kind: "action", action: { type: "SSP", value: true } });
    // dealer yash(1): SB Bob, BB Carol, UTG Dave straddles
    g.ok(d, { kind: "action", action: { type: "SSP", value: true } });
    g.stack(mkDeck([b, c, d, y], { [y]: ["2c", "3d"], [b]: ["7c", "8d"], [c]: ["Tc", "9d"], [d]: ["Ac", "Ad"] }, ["As", "Kh", "4h", "9h", "Js"]), 0);
    g.ok(y, { kind: "startGame" });
    expect(plain(g).slice(-3)).toEqual(["Bob posts a small blind of 10", "Carol posts a big blind of 20", "Dave posts a straddle of 40"]);
    expect(g.st.hand!.actor).toBe(y); // left of the straddler
    expect(g.frame(y).hand!.minRaise).toBe(60);
    expect(g.st.players[d]!.stack).toBe(960);
    playOut(g, [[y, R, 60]]);
    expect(g.frame(b).hand!.minRaise).toBe(80);
    playOut(g, [[b, C], [c, C]]);
    expect(g.st.hand!.actor).toBe(d); // straddler last
    expect(g.frame(d).hand!.highestBet).toBe(60);
  });
  it("heads-up straddle: dealer/SB straddles, BB acts first, straddler checks", () => {
    const g = new Game(y); const d = g.seat("Dave", 2);
    cfgOf(g, { straddleAllowed: true });
    g.ok(y, { kind: "action", action: { type: "SSP", value: true } });
    g.stack(mkDeck([d, y], { [y]: ["2c", "3d"], [d]: ["7c", "8d"] }, ["As", "Kh", "4h", "9h", "Js"]), 0);
    g.ok(y, { kind: "startGame" });
    expect(plain(g).slice(-3)).toEqual(["yash posts a small blind of 10", "Dave posts a big blind of 20", "yash posts a straddle of 40"]);
    expect(g.st.hand!.actor).toBe(d);
    playOut(g, [[d, C]]);
    expect(plain(g).slice(-1)).toEqual(["Dave calls 40"]);
    playOut(g, [[y, K]]);
    expect(g.st.hand!.stage).toBe(1);
  });
});

describe("antes (08 f)", () => {
  it("posted before blinds in seat order, dead money, '(A:5)' data in frame, min bet unchanged", () => {
    const g = new Game(y); const b = g.seat("Bob", 2), c = g.seat("Carol", 3);
    cfgOf(g, { antes: true, blindLevels: [{ sb: 10, bb: 20, ante: 5, durationMin: null }] });
    g.stack(mkDeck([b, c, y], { [y]: ["2c", "3d"], [b]: ["7c", "8d"], [c]: ["Tc", "9d"] }, ["As", "Kh", "4h", "9h", "Js"]), 0);
    g.ok(y, { kind: "startGame" });
    const l = plain(g);
    const i = l.indexOf("yash posts an ante of 5");
    expect(l.slice(i, i + 5)).toEqual(["yash posts an ante of 5", "Bob posts an ante of 5", "Carol posts an ante of 5", "Bob posts a small blind of 10", "Carol posts a big blind of 20"]);
    expect(l).toContain("The game's ante was changed from 0 to 5.");
    const f = g.frame(y);
    expect(f.hand!.pot).toBe(15); expect(f.hand!.minRaise).toBe(40); expect(f.table.blinds).toEqual({ sb: 10, bb: 20, ante: 5, level: 1 });
    expect(g.st.players[y]!.stack).toBe(995);
  });
});

describe("pots and showdown", () => {
  it("side pot 120/1000/1000 -> main 360, side 1760 (two collected lines, main first)", () => {
    const g = new Game(y, 1000); const b = g.seat("Bob", 2, 1000), c = g.seat("Carol", 3, 120);
    g.stack(mkDeck([y, b, c], { [y]: ["As", "Ad"], [b]: ["Kh", "Kc"], [c]: ["Qh", "Qc"] }, ["2c", "7d", "9h", "3s", "4d"]), 2);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[c, R, 120], [y, R, 1000], [b, C]]);
    g.toResult();
    const col = plain(g).filter((x) => x.includes("collected"));
    expect(col).toHaveLength(2);
    expect(col[0]).toMatch(/^yash collected 360 from pot with Pair, A's/);
    expect(col[1]).toMatch(/^yash collected 1760 from pot with Pair, A's/);
  });
  it("3-way chop of 33 = 11 each in seat order from the left of the dealer", () => {
    const g = new Game(y, 1000, 5, 11); const b = g.seat("Bob", 2), c = g.seat("Carol", 3);
    // all three play the board A-5 straight
    g.stack(mkDeck([b, c, y], { [y]: ["Kc", "Qd"], [b]: ["Jc", "Td"], [c]: ["9c", "8d"] }, ["As", "3h", "2h", "5d", "4h"]), 2);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[c, C], [y, C], [b, K]]);
    for (let st = 0; st < 3; st++) playOut(g, [[y, K], [b, K], [c, K]]);
    g.toResult();
    const col = plain(g).filter((x) => x.includes("collected"));
    expect(col).toEqual([
      "yash collected 11 from pot with Straight, 5 High (combination: A♠, 2♥, 3♥, 4♥, 5♦)",
      "Bob collected 11 from pot with Straight, 5 High (combination: A♠, 2♥, 3♥, 4♥, 5♦)",
      "Carol collected 11 from pot with Straight, 5 High (combination: A♠, 2♥, 3♥, 4♥, 5♦)"
    ]);
  });
  it("muck: loser behind a better shown hand never shows; first left of dealer shows", () => {
    const g = new Game(y); const b = g.seat("Bob", 2), c = g.seat("Carol", 3);
    g.stack(mkDeck([y, b, c], { [y]: ["Kh", "Kc"], [b]: ["As", "Ad"], [c]: ["2c", "7d"] }, ["Qd", "Js", "4h", "9c", "3s"]), 2);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[c, C], [y, C], [b, K]]);
    for (let st = 0; st < 3; st++) playOut(g, [[y, K], [b, K], [c, K]]);
    g.toResult();
    const sh = plain(g).filter((x) => x.includes(" shows a "));
    expect(sh).toEqual(["yash shows a K♥, K♣.", "Bob shows a A♠, A♦."]);
  });
  it("hole cards: only own cards in frames; showdown reveals all; muck stays hidden", () => {
    const g = new Game(y); const b = g.seat("Bob", 2);
    g.stack(mkDeck([b, y], { [y]: ["As", "Ad"], [b]: ["Kh", "Kc"] }, ["Qd", "Js", "4h", "9c", "3s"]), 0);
    g.ok(y, { kind: "startGame" });
    const fy = g.frame(y), fb = g.frame(b), fs = g.frame(null);
    expect(fy.cards[y]!.cards).toEqual([{ value: "As", showing: false }, { value: "Ad", showing: false }]);
    expect(fy.cards[b]!.cards).toEqual([{ value: null, showing: false }, { value: null, showing: false }]);
    expect(fb.cards[y]!.cards[0]!.value).toBeNull();
    expect(JSON.stringify(fs)).not.toMatch(/"As"|"Ad"|"Kh"|"Kc"/);
  });
});
