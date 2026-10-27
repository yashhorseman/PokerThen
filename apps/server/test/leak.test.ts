import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_DECK } from "@pokerthen/shared";
import { Client, cleanup, seatGuest, startTest, type TestApp, type WsClient } from "./helpers.js";
import { fakeEngine, fakeTiming } from "./fakeEngine.js";

const apps: TestApp[] = [];
afterEach(async () => { for (const t of apps.splice(0)) { await t.stop().catch(() => {}); cleanup(t.dir); } fakeTiming.fold = 3000; fakeTiming.showdown = 6000; });

/** Walk every JSON string value; return those that are exactly a card code. */
function cardsIn(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === "string") { if ((CANONICAL_DECK as readonly string[]).includes(v)) out.add(v); }
  else if (Array.isArray(v)) v.forEach((x) => cardsIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => cardsIn(x, out));
  return out;
}

describe("hidden-card leak test (ARCH 5.4 item 7, FAIRNESS-MERKLE)", () => {
  it("no socket/HTTP payload ever contains a card its recipient may not know", async () => {
    fakeTiming.showdown = 400; fakeTiming.fold = 300;
    const t = await startTest(); apps.push(t);
    const clients: Client[] = [await new Client(t).init()];
    const gid = await clients[0]!.newGame("Ann");
    const names = ["Bob", "Cy"];
    for (let i = 0; i < names.length; i++) clients.push(await seatGuest(t, clients[0]!, gid, names[i]!, i + 2));
    const spectator = await new Client(t).init(); await spectator.http("GET", `/games/${gid}`);
    const all = [...clients, spectator];
    const sockets: WsClient[] = [];
    for (const c of all) { const w = c.ws(gid); await w.registered(); sockets.push(w); }
    const runner = t.app.registry.get(gid)!;
    // each viewer's cumulative "may know" set: own hole cards (from own projection) + anything flagged showing:true or on the board
    const known = new Map<string, Set<string>>(all.map((c) => [c.playerId, new Set<string>()]));
    const publicCards = new Set<string>();
    const holes = new Map<string, Set<string>>(); // actual hole cards per player, learned from their own projection
    const learn = () => {
      const hand = (runner.state as any).hand;
      if (!hand) return;
      for (const c of hand.board) publicCards.add(c);
      for (const id of hand.inHand) holes.set(id + "#" + hand.handId, new Set((hand.holeIdx[id] as number[]).map((ix) => hand.deck[ix])));
    };
    const poll = setInterval(learn, 5);
    const play = async (hands: number, mode: "showdown" | "fold") => {
      for (let h = 0; h < hands; h++) {
        const start = runner.state as any;
        if (!start.hand || start.hand.phase !== "betting") { await clients[0]!.http("POST", `/games/${gid}/start-game`, {}); }
        for (let i = 0; i < 40; i++) {
          learn();
          const hand = (runner.state as any).hand;
          if (!hand || hand.phase !== "betting") break;
          const actor = hand.inHand[hand.toAct];
          const idx = all.findIndex((c) => c.playerId === actor);
          sockets[idx]!.action(mode === "fold" ? "PLAYER_FOLD" : "PLAYER_CHECK");
          await new Promise((r) => setTimeout(r, 40));
          learn();
        }
        learn();
        const hn = (runner.state as any).handNumber;
        await sockets[0]!.until(() => (runner.state as any).handNumber > hn || (runner.state as any).hand?.phase === "result", 3000).catch(() => {});
        await new Promise((r) => setTimeout(r, mode === "fold" ? 450 : 600));
      }
    };
    await play(2, "fold");
    await play(2, "showdown");
    await new Promise((r) => setTimeout(r, 300));
    clearInterval(poll); learn();
    // 1. cards seen by each socket (all frames, parsed) vs. allowed
    const bad: string[] = [];
    sockets.forEach((s, i) => {
      const viewer = all[i]!.playerId;
      for (const raw of s.raw) {
        const m = JSON.parse(raw);
        const frames = m.t === "registered" || m.t === "rup" ? [m.frame] : m.t === "gC" ? [m.delta] : [];
        for (const f of frames) {
          for (const [pid, hc] of Object.entries<any>(f.cards ?? {})) {
            if (!hc || typeof hc !== "object") continue;
            for (const slot of hc.cards ?? []) {
              if (!slot || typeof slot !== "object") continue;
              if (slot.value && pid !== viewer && !slot.showing) bad.push(`viewer ${i} saw ${slot.value} of ${pid} without showing`);
            }
          }
        }
      }
    });
    expect(bad).toEqual([]);
    // 2. every actual hole card of a player that was never shown must not appear anywhere in other viewers' raw traffic or public HTTP
    const shown = new Set<string>();
    for (const [i, s] of sockets.entries()) for (const raw of s.raw) for (const mm of [JSON.parse(raw)]) {
      const fr = mm.t === "gC" ? mm.delta : mm.frame;
      for (const [pid, hc] of Object.entries<any>(fr?.cards ?? {})) for (const sl of hc?.cards ?? []) if (sl?.showing && sl.value) shown.add(`${pid}:${sl.value}`);
      void i;
    }
    const shownCards = new Set([...shown].map((x) => x.split(":")[1]!));
    const http = [
      ...(await Promise.all([1, 2, 3, 4].flatMap((n) => [spectator.http("GET", `/api/games/${gid}/fairness/${n}`), spectator.http("GET", `/api/games/${gid}/log_v3?hand_number=${n}`)]))),
      await spectator.http("GET", `/games/${gid}/players_sessions`), await spectator.http("GET", `/games/${gid}/pokerthen_log_${gid}.csv`)
    ];
    const spectatorTraffic = sockets[3]!.raw.join("\n") + http.map((r) => r.text).join("\n");
    const spectatorKnown = cardsIn([...sockets[3]!.raw.map((r) => JSON.parse(r)), ...http.map((r) => r.json)]);
    let checked = 0;
    for (const [key, cs] of holes) {
      const pid = key.split("#")[0]!;
      for (const c of cs) {
        const wasShown = shown.has(`${pid}:${c}`);
        // a spectator may only know a hole card if it was published with showing:true or is a board card
        if (!wasShown && !publicCards.has(c) && !shownCards.has(c)) { checked++; expect(spectatorKnown.has(c), `spectator learned hidden ${c} of ${pid}`).toBe(false); }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(spectatorTraffic).not.toMatch(/masterSalt|"deck"/);
    // 3. other players never see my hole cards either (cross-check pairwise)
    for (let v = 0; v < clients.length; v++) {
      const vk = cardsIn(sockets[v]!.raw.map((r) => JSON.parse(r)));
      for (const [key, cs] of holes) {
        const pid = key.split("#")[0]!;
        if (pid === clients[v]!.playerId) continue;
        const mine = new Set([...holes].filter(([k]) => k.startsWith(clients[v]!.playerId + "#")).flatMap(([, x]) => [...x]));
        for (const c of cs) if (!shownCards.has(c) && !publicCards.has(c) && !mine.has(c)) expect(vk.has(c), `viewer ${v} learned hidden ${c} of ${pid}`).toBe(false);
      }
    }
    // 4. reveals never contain unexposed cards (fold hands: none; showdown: only board + shown holes)
    for (let n = 1; n <= (runner.state as any).handNumber; n++) {
      const rec = (await spectator.http("GET", `/api/games/${gid}/fairness/${n}`)).json;
      if (!rec?.reveal) continue;
      const revealed = new Set<string>(rec.reveal.cards.map((c: any) => c.card));
      const unexposed = [...holes].filter(([k]) => k.endsWith("#" + rec.reveal.handId)).flatMap(([k, cs]) => [...cs].map((c) => [k.split("#")[0]!, c] as const)).filter(([pid, c]) => !shown.has(`${pid}:${c}`));
      for (const [, c] of unexposed) if (!rec.reveal.cards.some((x: any) => x.card === c && rec.reveal.usage.some((u: any) => u.kind === "board" && u.indices.includes(x.index)))) expect(revealed.has(c)).toBe(false);
      expect(JSON.stringify(rec)).not.toMatch(/masterSalt|"deck"/);
    }
    void fakeEngine;
    sockets.forEach((s) => s.close());
  }, 30_000);
});

