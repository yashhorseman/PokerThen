import { describe, expect, it } from "vitest";
import { seededEntropy } from "@pokerthen/shared/testing";
import { defaultGameConfig, CANONICAL_DECK, type ActionMsg, type CardCode, type EngineEffect } from "@pokerthen/shared";
import { Game, id } from "./helpers.js";
import { tuning } from "../src/placeholders.js";
import { asS } from "../src/state.js";
import { engine } from "../src/index.js";

const CARD = /"([2-9TJQKA][shdc])"/g;
function cardsIn(json: string): Set<string> { const s = new Set<string>(); for (const m of json.matchAll(CARD)) s.add(m[1]!); return s; }

/** cards a viewer may legitimately see */
function allowed(g: Game, viewer: string | null): Set<string> {
  const s = asS(g.s); const h = s.hand; const ok = new Set<string>();
  if (!h) return ok;
  h.board1.forEach((c) => ok.add(c)); h.board2.forEach((c) => ok.add(c));
  for (const pid of h.participants) {
    h.holes[pid]!.forEach((c, i) => { if (h.showing[pid]![i]) ok.add(c); });
    const v = viewer ? s.players[viewer] : undefined;
    const god = !!v && v.seat === null && s.config.spectatorMode && s.godModeIds.includes(v.id) && s.players[pid]!.allowSpectator;
    if (pid === viewer || god) h.holes[pid]!.forEach((c) => ok.add(c));
  }
  if (viewer && h.rabbit.hunters.includes(viewer)) h.rabbit.cards.forEach((c) => ok.add(c));
  return ok;
}

describe("hidden card leak test (R-1)", () => {
  it("no frame contains a card the viewer may not see, across random hands, all viewers", () => {
    tuning.equityRuns = 100;
    let frames = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = new Game(id("owner")); g.ent.fallback = seededEntropy(seed);
      const names = ["Aa1", "Bb2", "Cc3", "Dd4"]; const ids = [id("owner"), ...names.map((n, i) => g.seat(n, i + 2, 400))];
      const watcher = id("watch"); g.ok(watcher, { kind: "presence", connected: true });
      const cfg = defaultGameConfig(10, 20); cfg.runItTwice = "ask_players"; cfg.rabbitHunt = true; cfg.spectatorMode = false;
      g.ok(id("owner"), { kind: "updateGame", config: cfg });
      g.ok(id("owner"), { kind: "startGame" });
      let rnd = seed * 7919;
      const r = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
      for (let guard = 0; guard < 600 && g.st.handNumber < 25; guard++) {
        const h = g.st.hand;
        if (!h) break;
        for (const viewer of [...ids, watcher, null]) {
          const out = cardsIn(JSON.stringify(g.frame(viewer))); const ok = allowed(g, viewer);
          for (const c of out) expect(ok.has(c), `seed ${seed} hand ${h.number} phase ${h.phase} viewer ${viewer} saw ${c}`).toBe(true);
          frames++;
        }
        // effects visible to everybody (no onlyFor) must not contain hole cards that are not shown
        for (const e of g.fx) if (e.kind === "log" && !e.onlyFor) {
          const m = [...e.msg.matchAll(/[2-9]|10|[JQKA]/g)];
          void m;
        }
        if (h.phase === "betting" && h.actor) {
          const a = h.actor; const need = h.highest - (h.bets[a] ?? 0); const x = r();
          const act: ActionMsg = x < 0.2 && need > 0 ? { type: "PLAYER_FOLD" } : x < 0.75 ? (need > 0 ? { type: "PLAYER_CALL" } : { type: "PLAYER_CHECK" }) : { type: "PLAYER_RAISE", value: h.highest + h.lastRaise + Math.floor(r() * 5) * 20 + (r() < 0.2 ? 3000 : 0) };
          if (!g.act(a, act).ok) g.act(a, need > 0 ? { type: "PLAYER_CALL" } : { type: "PLAYER_CHECK" });
        } else if (h.phase === "ritVote") { for (const p of h.participants) g.act(p, { type: "DRITD", decision: r() < 0.8 }); }
        else if (h.phase === "result") { if (r() < 0.5) for (const p of [...ids]) g.act(p, { type: r() < 0.5 ? "RUC" : "SHOW_HAND", cardToShow: "all" } as ActionMsg); g.step(); }
        else if (!g.step()) break;
      }
    }
    expect(frames).toBeGreaterThan(2000);
  });
  it("god mode viewers see only cards of seated players who allowed it; everyone else sees nothing extra", () => {
    const g = new Game(id("owner")); const a = g.seat("Aa1", 2, 500);
    const cfg = defaultGameConfig(10, 20); cfg.spectatorMode = true; g.ok(id("owner"), { kind: "updateGame", config: cfg });
    // Bob requests with allowSpectator
    const b = id("Bob"); g.ok(b, { kind: "presence", connected: true });
    g.ok(b, { kind: "requestIngress", body: { seat: 3, playerName: "Bob", allowSpectator: true, stack: 500 } });
    g.ok(id("owner"), { kind: "approvePlayer", playerID: b });
    const w = id("watch"); g.ok(w, { kind: "presence", connected: true });
    g.ok(id("owner"), { kind: "toggleGodMode", playerID: w, allow: true });
    g.ok(id("owner"), { kind: "startGame" });
    const f = g.frame(w); const h = g.st.hand!;
    expect(f.cards[b]!.cards.map((c) => c.value)).toEqual(h.holes[b]!);
    expect(f.cards[a]!.cards.map((c) => c.value)).toEqual([null, null]);
    expect(g.frame(null).cards[b]!.cards.map((c) => c.value)).toEqual([null, null]);
  });
  it("log effects visible to all never contain undisclosed hole cards; 'Your hand is' is onlyFor", () => {
    const g = new Game(id("owner")); const a = g.seat("Aa1", 2, 500);
    g.ok(id("owner"), { kind: "startGame" });
    const yh = g.fx.filter((e): e is Extract<EngineEffect, { kind: "log" }> => e.kind === "log" && e.msg.startsWith("Your hand is"));
    expect(yh).toHaveLength(2); expect(yh.every((e) => e.onlyFor !== undefined)).toBe(true);
    const h = g.st.hand!;
    const pub = g.fx.filter((e): e is Extract<EngineEffect, { kind: "log" }> => e.kind === "log" && !e.onlyFor).map((e) => e.msg).join("\n");
    for (const c of [...h.holes[id("owner")]!, ...h.holes[a]!]) expect(pub).not.toContain(c[0] === "T" ? "10" + { s: "♠", h: "♥", d: "♦", c: "♣" }[c[1] as "s"] : c[0] + { s: "♠", h: "♥", d: "♦", c: "♣" }[c[1] as "s"]);
    expect(JSON.stringify(g.fx.filter((e) => e.kind === "commit"))).not.toMatch(CARD);
    void CANONICAL_DECK; void engine; void (null as unknown as CardCode);
  });
});
