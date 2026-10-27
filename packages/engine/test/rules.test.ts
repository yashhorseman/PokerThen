import { describe, expect, it } from "vitest";
import { Game, id, lines, mkDeck, playOut, strip } from "./helpers.js";
import { tuning } from "../src/placeholders.js";

const F = "PLAYER_FOLD", K = "PLAYER_CHECK", C = "PLAYER_CALL", R = "PLAYER_RAISE";
const O = "yash";

function table(names: Array<[string, number, number]>, cfg: Record<string, unknown> = {}) {
  const g = new Game(id(O));
  for (const [n, seat, stack] of names) g.seat(n, seat, stack);
  if (Object.keys(cfg).length) g.ok(id(O), { kind: "updateGame", config: { ...(g.st.config as object), ...cfg } as never });
  return g;
}

describe("run it twice + side pots (research 07 / 08)", () => {
  it("3 all-in with side pot, uncalled 590 returned, all YES: halves per run", () => {
    tuning.equityRuns = 300;
    // yash seat1 880, Dave 1180, Carol 1770 ; dealer Dave(index1 among [yash,Dave,Carol])
    const g = table([["Dave", 2, 1180], ["Carol", 3, 1770]], { runItTwice: "ask_players" });
    g.ok(id(O), { kind: "action", action: { type: "SSP", value: false } });
    // owner stack 1000 -> set to 880 via edit while waiting
    g.ok(id(O), { kind: "updatePlayer", playerID: id(O), stackChange: 880, stackChangeMode: "SET" });
    const y = id(O), d = id("Dave"), c = id("Carol");
    // dealer index 2 => Carol dealer; SB yash, BB Dave, first to act Carol
    const deck = mkDeck([y, d, c], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"], [c]: ["2c", "7d"] }, ["Qs", "Jd", "4h", "9c", "3s"], ["Ts", "8h", "5h", "6d", "9s", "Jc", "2s", "3d"]);
    g.stack(deck, 2);
    g.ok(y, { kind: "startGame" });
    g.clearFx();
    playOut(g, [[c, R, 1770], [y, C], [d, C]]);
    expect(g.logs().map(strip)).toContain("Uncalled bet of 590 returned to Carol");
    const fr = g.frame(y);
    expect(fr.turn.nextStep).toBe("NSARD");
    for (const p of [y, d, c]) g.okAct(p, { type: "DRITD", decision: true });
    while (g.st.hand && g.st.hand.phase !== "result") g.step();
    const l = g.logs().map(strip);
    if (process.env.SHOWLOG) console.log(l.join("\n"));
    expect(l).toContain("Remaining players decide whether to run it twice.");
    expect(l).toContain("All players in hand choose to run it twice.");
    expect(l.filter((x) => x.includes("collected"))).toHaveLength(4);
    const total = ["yash", "Dave", "Carol"].reduce((a, n) => a + g.st.players[id(n)]!.stack, 0);
    expect(total).toBe(880 + 1180 + 1770);
    expect(l.findIndex((x) => x.includes("shows a"))).toBeLessThan(l.findIndex((x) => x.startsWith("Flop:")));
    expect(l.some((x) => x.startsWith("Flop (second run):"))).toBe(true);
  });

  it("odd pot RIT: 1005 -> 503 run1 / 502 run2 (08 b)", () => {
    const g = table([["Max", 2, 335], ["Kim", 3, 335]], { runItTwice: "always" });
    g.ok(id(O), { kind: "updatePlayer", playerID: id(O), stackChange: 335, stackChangeMode: "SET" });
    const y = id(O), m = id("Max"), k = id("Kim");
    // Max wins both runs with aces
    const deck = mkDeck([m, k, y], { [y]: ["2c", "3d"], [m]: ["As", "Ah"], [k]: ["7c", "8d"] }, ["Ks", "Qd", "4h", "9c", "Js"], ["Tc", "5s", "6s", "Kd", "Th", "2s", "Jh", "3s"]);
    g.stack(deck, 0);
    g.ok(y, { kind: "startGame" }); // dealer yash; SB Max, BB Kim, first yash
    g.clearFx();
    playOut(g, [[y, R, 335], [m, C], [k, C]]);
    while (g.st.hand && g.st.hand.phase !== "result") g.step();
    const l = g.logs().map(strip).filter((x) => x.includes("collected"));
    expect(l[0]).toMatch(/Max collected 503 from pot with /);
    expect(l[1]).toMatch(/Max collected 502 from pot with .* on the second run  \(combination:/);
  });

  it("any NO -> immediate 'Some players choose to not run it twice.'", () => {
    const g = table([["Dave", 2, 1000]], { runItTwice: "ask_players" });
    const y = id(O), d = id("Dave");
    g.stack(mkDeck([d, y], { [y]: ["As", "Ah"], [d]: ["Kc", "Kd"] }, ["2c", "7d", "9h", "3s", "4d"]), 0);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[y, R, 1000], [d, C]]);
    g.okAct(d, { type: "DRITD", decision: false });
    const l = g.logs().map(strip);
    expect(l.slice(-2)).toEqual(["Dave chooses to not run it twice.", "Some players choose to not run it twice."]);
  });
});
