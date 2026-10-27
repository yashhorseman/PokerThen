import { afterEach, describe, expect, it } from "vitest";
import { FIELD_ERRORS } from "@pokerthen/shared";
import { engine } from "@pokerthen/engine";
import { Client, cleanup, startTest, type TestApp } from "./helpers.js";

const apps: TestApp[] = [];
afterEach(async () => { for (const t of apps.splice(0)) { await t.stop().catch(() => {}); cleanup(t.dir); } });

const body = (extra: Record<string, unknown>) => ({ playerName: "Ann", gM: "th", bigBlind: 20, smallBlind: 10, cM: false, ...extra });

describe("POST /new-game: the host chooses the starting stack (owner-approved difference from the reference)", () => {
  it("uses the chosen stack, defaults to 1000 when the field is absent, and rejects values outside 1..1.000.000", async () => {
    const t = await startTest({ engine }); apps.push(t);

    const chosen = await new Client(t).init();
    const r = await chosen.http("POST", "/new-game", body({ playerStack: 2500 }));
    expect(r.status).toBe(200);
    const ws = chosen.ws(r.json.gameID);
    await ws.registered();
    const me = ws.frame!.players[chosen.playerId]!;
    expect(me.stack).toBe(2500);
    ws.ws.close();

    const dflt = await new Client(t).init();
    const r2 = await dflt.http("POST", "/new-game", body({}));
    expect(r2.status).toBe(200);
    const ws2 = dflt.ws(r2.json.gameID);
    await ws2.registered();
    expect(ws2.frame!.players[dflt.playerId]!.stack).toBe(1000);
    ws2.ws.close();

    for (const bad of [0, -5, 1.5, 1_000_001, 99999999999]) {
      const c = await new Client(t).init();
      const rb = await c.http("POST", "/new-game", body({ playerStack: bad }));
      expect(rb.status, `stack ${bad}`).toBe(422);
      expect(rb.json).toEqual({ stack: FIELD_ERRORS.stackRange });
    }
  });
});
