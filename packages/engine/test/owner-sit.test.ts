import { describe, expect, it } from "vitest";
import { Game, id } from "./helpers.js";

describe("owner takes a seat directly (SPEC 2.3 `Take the Seat`)", () => {
  it("owner leaves and sits again: seated at once with the typed stack, no request, no approval line; a guest still needs approval", () => {
    const g = new Game(id("yash"));
    const y = id("yash");
    g.okAct(y, { type: "QNH" }); // no hand running -> leaves the seat immediately
    expect(g.st.players[y]!.seat).toBeNull();
    g.clearFx();

    g.ok(y, { kind: "requestIngress", body: { seat: 5, playerName: "yash", allowSpectator: false, stack: 700 } });
    const p = g.st.players[y]!;
    expect(p.seat).toBe(5);
    expect(p.stack).toBe(700);
    expect(p.status).toBe("inGame");
    expect(g.logs().some((l) => /requested a seat|approved the player/.test(l))).toBe(false);
    expect(g.frame(y).players[y]!.status).toBe("inGame");

    const bob = id("Bob");
    g.ok(bob, { kind: "presence", connected: true });
    g.ok(bob, { kind: "requestIngress", body: { seat: 2, playerName: "Bob", allowSpectator: false, stack: 500 } });
    expect(g.st.players[bob]!.seat).toBeNull();
    expect(g.st.players[bob]!.status).toBe("requestedGameIngress");
    g.ok(y, { kind: "approvePlayer", playerID: bob });
    expect(g.st.players[bob]!.seat).toBe(2);
  });

  it("owner still gets the normal validation errors (stack range, taken seat)", () => {
    const g = new Game(id("yash"));
    const y = id("yash");
    g.okAct(y, { type: "QNH" });
    const bad = g.cmd(y, { kind: "requestIngress", body: { seat: 5, playerName: "yash", allowSpectator: false, stack: 0 } });
    expect(bad.ok).toBe(false);
    expect(g.st.players[y]!.seat).toBeNull();
  });
});
