import { describe, expect, it } from "vitest";
import { Game, id, strip } from "./helpers.js";

describe("smoke", () => {
  it("plays SPEC 15.2 hand #1", () => {
    const g = new Game(id("yash"));
    const bob = g.seat("Bob", 2), carol = g.seat("Carol", 3), dave = g.seat("Dave", 4);
    const yash = id("yash");
    // deal order after dealer Carol: Dave, yash, Bob, Carol
    g.stack(["3d", "6h", "2c", "4c", "Qh", "8d", "3c", "5c", "2d", "7s", "9c", "5d", "2h", "9s", "2s", "6c"], 2);
    g.ok(yash, { kind: "startGame" });
    for (const [who, a] of [[bob, "PLAYER_FOLD"], [carol, "PLAYER_CALL"], [dave, "PLAYER_CALL"], [yash, "PLAYER_CHECK"]] as const) {
      g.okAct(who, { type: a } as never); g.step();
    }
    expect(g.logs().some((l) => l.includes("starting hand #1"))).toBe(true);
  });
});
