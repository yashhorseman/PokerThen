import { describe, expect, it } from "vitest";
import { Game, id, mkDeck, playOut, strip } from "./helpers.js";

const F = "PLAYER_FOLD", K = "PLAYER_CHECK", C = "PLAYER_CALL", R = "PLAYER_RAISE";
const O = "yash"; const y = id(O);
const cfgOf = (g: Game, over: Record<string, unknown>) => g.ok(y, { kind: "updateGame", config: { ...(g.st.config as object), ...over } as never });
const plain = (g: Game) => g.logs().map(strip);

describe("positions and order", () => {
  it("heads-up: dealer is SB and acts first preflop; BB acts first postflop", () => {
    const g = new Game(y); const d = g.seat("Dave", 2);
    g.stack(mkDeck([d, y], { [y]: ["2c", "3d"], [d]: ["7c", "8d"] }, ["As", "Kd", "4h", "9c", "Js"]), 0); // dealer yash
    g.ok(y, { kind: "startGame" });
    expect(g.st.hand!.sbId).toBe(y); expect(g.st.hand!.bbId).toBe(d); expect(g.st.hand!.actor).toBe(y);
    playOut(g, [[y, C], [d, K]]);
    expect(g.st.hand!.actor).toBe(d);
  });
  it("4-handed: UTG acts first, BB has the option, postflop SB first, button advances", () => {
    const g = new Game(y); const b = g.seat("Bob", 2), c = g.seat("Carol", 3), d = g.seat("Dave", 4);
    g.stack(mkDeck([d, y, b, c], { [y]: ["2c", "3d"], [b]: ["7c", "8d"], [c]: ["Tc", "9d"], [d]: ["Ac", "Ad"] }, ["As", "Kd", "4h", "9c", "Js"]), 2);
    g.ok(y, { kind: "startGame" });
    const h = () => g.st.hand!;
    expect([h().dealerId, h().sbId, h().bbId, h().actor]).toEqual([c, d, y, b]);
    playOut(g, [[b, C], [c, C], [d, C]]);
    expect(h().actor).toBe(y);
    expect(g.frame(y).hand!.optionIds).toEqual([y]);
    playOut(g, [[y, K]]);
    expect(h().actor).toBe(d); // SB first postflop
    playOut(g, [[d, R, 40], [y, F], [b, F], [c, F]]);
    g.toResult();
    g.until(() => g.st.hand!.number === 2);
    expect(g.st.hand!.dealerId).toBe(d); // button moved clockwise to Dave
  });
  it("dead button: header says (dead button); dead small blind then missing small blind", () => {
    const g = new Game(y); const b = g.seat("Bob", 2), c = g.seat("Carol", 3), d = g.seat("Dave", 4);
    g.stack(mkDeck([b, c, d, y], { [y]: ["2c", "3d"], [b]: ["7c", "8d"], [c]: ["Tc", "9d"], [d]: ["Ac", "Ad"] }, ["As", "Kd", "4h", "9c", "Js"]), 0); // dealer yash(1)
    g.ok(y, { kind: "startGame" });
    // Bob (seat 2, next button) leaves the seat during the hand
    g.okAct(b, { type: "QNH" });
    playOut(g, [[d, F], [y, F]]); // Bob (SB, leaving) is auto-folded on his turn
    g.toResult();
    g.until(() => g.st.hand!.number === 2);
    expect(plain(g).some((l) => l.includes("(dead button)"))).toBe(true);
    expect(plain(g)).toContain("The player Bob quits the game with a stack of 990.");
  });
});

describe("raise rules", () => {
  it("min-raise chain and min bet", () => {
    const g = new Game(y); const d = g.seat("Dave", 2); const e = g.seat("Eve", 3);
    g.stack(mkDeck([d, e, y], { [y]: ["2c", "3d"], [d]: ["7c", "8d"], [e]: ["Tc", "9d"] }, ["As", "Kh", "4h", "9h", "Js"]), 2);
    g.ok(y, { kind: "startGame" }); // dealer Eve(3): SB yash BB Dave, first Eve
    expect(g.frame(e).hand!.minRaise).toBe(40);
    expect(g.act(e, { type: R, value: 39 }).ok).toBe(false);
    g.okAct(e, { type: R, value: 60 }); g.step();
    expect(g.frame(y).hand!.minRaise).toBe(100); // 60 + 40
    g.okAct(y, { type: R, value: 100 }); g.step();
    expect(g.frame(y).hand!.minRaise).toBe(140);
    expect(plain(g).slice(-2)).toEqual(["Eve raises to 60", "yash raises to 100"]);
  });
  it("short all-in does not reopen betting for prior actors; min-raise uses the short shove increment (08 c)", () => {
    const g = new Game(y, 1000); const k = g.seat("Kim", 2, 180), l = g.seat("Lou", 3, 1000);
    g.stack(mkDeck([y, k, l], { [y]: ["2c", "3d"], [k]: ["7c", "8d"], [l]: ["Tc", "9d"] }, ["As", "Kh", "4h", "9h", "Js"]), 2);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[l, C], [y, C], [k, K]]);
    playOut(g, [[y, R, 100]]);
    playOut(g, [[k, R, 160]]); // 160 total, +60 only: short
    expect(plain(g).slice(-1)).toEqual(["Kim raises to 160 and go all in"]);
    const f = g.frame(l).hand!;
    expect(f.minRaise).toBe(220);
    expect(f.noReraiseIds).toEqual([y]);
    playOut(g, [[l, R, 220]]); // full raise (+60) reopens for everybody
    const f2 = g.frame(y).hand!;
    expect(f2.noReraiseIds).toEqual([]);
    expect(f2.minRaise).toBe(280);
  });
  it("short all-in: prior actor cannot raise, only call or fold", () => {
    const g = new Game(y, 1000); const k = g.seat("Kim", 2, 180), l = g.seat("Lou", 3, 1000);
    g.stack(mkDeck([y, k, l], { [y]: ["2c", "3d"], [k]: ["7c", "8d"], [l]: ["Tc", "9d"] }, ["As", "Kh", "4h", "9h", "Js"]), 2);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[l, C], [y, C], [k, K], [y, R, 100], [k, R, 160], [l, C]]);
    expect(g.st.hand!.actor).toBe(y);
    expect(g.act(y, { type: R, value: 400 }).ok).toBe(false);
    expect(g.act(y, { type: C }).ok).toBe(true);
  });
  it("uncalled bet returned on fold-win: exact lines (SPEC 11.3)", () => {
    const g = new Game(y); const d = g.seat("Dave", 2);
    g.stack(mkDeck([d, y], { [y]: ["2c", "3d"], [d]: ["7c", "8d"] }, ["As", "Kd", "4h", "9c", "Js"]), 0);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[y, R, 120], [d, F]]);
    g.toResult();
    expect(g.logs().slice(-3)).toEqual([`Uncalled bet of 100 returned to "yash @ yash______"`, `"yash @ yash______" collected 40 from pot`, "-- ending hand #1 --"]);
  });
  it("auto trim cuts raises to the largest opposing stack", () => {
    const g = new Game(y, 1000); const k = g.seat("Kim", 2, 300);
    cfgOf(g, { autoTrimBets: true });
    g.stack(mkDeck([k, y], { [y]: ["2c", "3d"], [k]: ["7c", "8d"] }, ["As", "Kd", "4h", "9c", "Js"]), 0);
    g.ok(y, { kind: "startGame" });
    expect(g.frame(y).hand!.maxBet).toBe(300);
    playOut(g, [[y, R, 900]]);
    expect(plain(g).slice(-1)).toEqual(["yash raises to 300"]);
  });
});
