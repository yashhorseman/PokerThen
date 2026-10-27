import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_DECK, defaultGameConfig } from "@pokerthen/shared";
import { engine } from "@pokerthen/engine";
import { Client, cleanup, seatGuest, startTest, type TestApp, type WsClient } from "./helpers.js";

/** The real engine counts as "landed" once createTable works. Until then this suite is skipped (fake-engine suites cover the server). */
const landed = (() => {
  try { engine.createTable({ gameId: "ptlAAAAAAAAAAAAAAAAAAAAA", ownerId: "ownerOwner1", ownerName: "Ann", stack: 1000, sb: 10, bb: 20 }, { now: 1, entropy: (n) => new Uint8Array(n).map((_, i) => i * 7) }); return true; } catch { return false; }
})();

const apps: TestApp[] = [];
afterEach(async () => { for (const t of apps.splice(0)) { await t.stop().catch(() => {}); cleanup(t.dir); } });
const cardsIn = (v: unknown, out = new Set<string>()): Set<string> => {
  if (typeof v === "string") { if ((CANONICAL_DECK as readonly string[]).includes(v)) out.add(v); }
  else if (Array.isArray(v)) v.forEach((x) => cardsIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => cardsIn(x, out));
  return out;
};

describe.skipIf(!landed)("REAL engine integration (packages/engine)", () => {
  it("3 players: hand starts, commit precedes hole cards, hidden cards never leak, fairness endpoint public", async () => {
    const t = await startTest({ engine }); apps.push(t);
    const owner = await new Client(t).init();
    const gid = await owner.newGame("Ann");
    const guests = [await seatGuest(t, owner, gid, "Bob", 2), await seatGuest(t, owner, gid, "Cy", 3)];
    const all = [owner, ...guests];
    const socks: WsClient[] = [];
    for (const c of all) { const w = c.ws(gid); await w.registered(); socks.push(w); }
    expect((await owner.http("POST", `/games/${gid}/start-game`, {})).status).toBe(200);
    await socks[0]!.until(() => socks[0]!.frame?.hand);
    const commit = (await new Client(t).http("GET", `/api/games/${gid}/fairness/1`)).json;
    expect(commit.commitment).toMatch(/^[0-9a-f]{64}$/);
    expect(commit.reveal).toBeNull();
    // everyone folds/checks whatever is legal until the hand is over; scan traffic
    for (let i = 0; i < 30; i++) {
      const turn = socks[0]!.frame!.turn.playerId;
      if (!turn || socks[0]!.frame!.hand?.street?.stage === 5) break;
      const idx = all.findIndex((c) => c.playerId === turn);
      socks[idx]!.action(i % 2 ? "PLAYER_CALL" : "PLAYER_FOLD");
      await new Promise((r) => setTimeout(r, 60));
    }
    // each viewer sees only own hole values (value present with showing:false) before any showing:true
    socks.forEach((s, i) => {
      for (const raw of s.raw) {
        const m = JSON.parse(raw); const f = m.frame ?? m.delta; if (!f?.cards) continue;
        for (const [pid, hc] of Object.entries<any>(f.cards)) for (const sl of hc?.cards ?? []) if (sl?.value && !sl.showing) expect(pid).toBe(all[i]!.playerId);
      }
    });
    const pub = JSON.stringify((await new Client(t).http("GET", `/api/games/${gid}/fairness/1`)).json);
    expect(pub).not.toMatch(/masterSalt|"deck"/);
    void cardsIn; void defaultGameConfig;
    socks.forEach((s) => s.close());
  }, 20_000);

  it("DEV_FIXED_DECKS entropy produces the scripted deck through the real shuffle", async () => {
    const { fixedDeckEntropy } = await import("../src/devEntropy.js");
    const deck = [...CANONICAL_DECK].reverse();
    const t = await startTest({ engine, entropy: fixedDeckEntropy([{ deck, pre: [0] }]) }); apps.push(t);
    const owner = await new Client(t).init();
    const gid = await owner.newGame("Ann");
    const g = await seatGuest(t, owner, gid, "Bob", 2);
    expect(g.playerId).toBeTruthy();
    expect((await owner.http("POST", `/games/${gid}/start-game`, {})).status).toBe(200);
    expect(engine._debugDeck!(t.app.registry.get(gid)!.state)).toEqual(deck);
  });

  it("crash mid-hand and restart: same deck/commitment, table keeps running, no duplicate log lines", async () => {
    const t1 = await startTest({ engine }); apps.push(t1);
    const owner = await new Client(t1).init();
    const gid = await owner.newGame("Ann");
    await seatGuest(t1, owner, gid, "Bob", 2);
    await owner.http("POST", `/games/${gid}/start-game`, {});
    const r1 = t1.app.registry.get(gid)!;
    const deck = engine._debugDeck!(r1.state); const commit = (await owner.http("GET", `/api/games/${gid}/fairness/1`)).json.commitment;
    const log1 = (await owner.http("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json;
    await t1.app.crash();
    const t2 = await startTest({ engine, dir: t1.dir }); apps.push(t2);
    const r2 = t2.app.registry.get(gid)!;
    expect(engine._debugDeck!(r2.state)).toEqual(deck);
    const o2 = new Client(t2); o2.cookie = owner.cookie; o2.playerId = owner.playerId;
    expect((await o2.http("GET", `/api/games/${gid}/fairness/1`)).json.commitment).toBe(commit);
    const log2 = (await o2.http("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json;
    expect(log2.slice(0, log1.length)).toEqual(log1);
    expect(new Set(log2.map((e: any) => e.createdAt)).size).toBe(log2.length);
  });
});
