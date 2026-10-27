import { expect } from "vitest";
import { seededEntropy } from "@pokerthen/shared/testing";
import { defaultGameConfig, type ActionMsg } from "@pokerthen/shared";
import { Game, id } from "./helpers.js";
import { tuning } from "../src/placeholders.js";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function totalChips(g: Game): number {
  const s = g.st; let t = 0;
  for (const p of Object.values(s.players)) t += p.stack;
  if (s.hand && !s.hand.closed) { t += s.hand.pot; for (const v of Object.values(s.hand.bets)) t += v; }
  return t;
}
function uniqueCards(g: Game) {
  const h = g.st.hand; if (!h) return;
  const all = [...Object.values(h.holes).flat(), ...h.board1, ...h.board2.slice(h.runoutFrom === 0 ? 0 : h.runoutFrom === 1 ? 3 : 4)];
  expect(new Set(all).size).toBe(all.length);
}

export function playRandom(seed: number, hands: number, opts: { rit?: "always" | "ask_players" | "no"; straddle?: boolean; antes?: boolean } = {}) {
  tuning.equityRuns = 200;
  const rnd = mulberry(seed);
  const g = new Game(id("owner"), 1000, 10, 20);
  g.ent.fallback = seededEntropy(seed);
  const n = 2 + Math.floor(rnd() * 8);
  const ids = [id("owner")];
  for (let i = 1; i < n; i++) ids.push(g.seat("P" + i, i + 1, 200 + Math.floor(rnd() * 1800)));
  const cfg = defaultGameConfig(10, 20);
  cfg.runItTwice = opts.rit ?? (["always", "ask_players", "no"] as const)[Math.floor(rnd() * 3)]!;
  cfg.straddleAllowed = opts.straddle ?? rnd() < 0.3; cfg.antes = opts.antes ?? rnd() < 0.2;
  if (cfg.antes) cfg.blindLevels = [{ sb: 10, bb: 20, ante: 5, durationMin: null }];
  cfg.rabbitHunt = rnd() < 0.5; cfg.revealAllWhenNoAction = rnd() < 0.8; cfg.decisionLimitSec = 20; cfg.autoTrimBets = rnd() < 0.3;
  g.ok(id("owner"), { kind: "updateGame", config: cfg });
  for (const pid of ids) g.ok(pid, { kind: "action", action: { type: "SSP", value: rnd() < 0.5 } });
  const total = totalChips(g);
  g.ok(id("owner"), { kind: "startGame" });
  let done = 0; let lastHand = 0; let guard = 0; let baseNo = -1; let base = 0;
  while (done < hands && guard++ < 20000) {
    const s = g.st; const h = s.hand;
    if (h && !h.closed) { if (h.number !== baseNo) { baseNo = h.number; base = totalChips(g); } else expect(totalChips(g)).toBe(base); }
    uniqueCards(g);
    if (!h) { // table dropped to waiting: re-seat busted, restart
      for (const pid of ids) { const p = g.st.players[pid]!; if (p.seat === null) { g.ok(pid, { kind: "requestIngress", body: { seat: [1,2,3,4,5,6,7,8,9,10].find((x) => !Object.values(g.st.players).some((q) => q.seat === x))!, playerName: p.name === "Guest" ? "R" + pid.slice(0, 3) + guard : p.name, allowSpectator: false, stack: 500 } }); if (g.st.players[pid]!.status === "requestedGameIngress") g.ok(id("owner"), { kind: "approvePlayer", playerID: pid }); /* the owner takes a seat directly (SPEC 2.3) */ } }
      if (g.st.status === "waiting") { const r = g.cmd(id("owner"), { kind: "startGame" }); if (!r.ok) break; }
      continue;
    }
    if (h.number !== lastHand) { lastHand = h.number; done++; }
    if (h.phase === "betting" && h.actor) {
      const a = h.actor; const p = s.players[a]!;
      const need = h.highest - (h.bets[a] ?? 0);
      const r = rnd(); let act: ActionMsg;
      if (r < 0.15 && need > 0) act = { type: "PLAYER_FOLD" };
      else if (r < 0.65) act = need > 0 ? { type: "PLAYER_CALL" } : { type: "PLAYER_CHECK" };
      else { const to = Math.min((h.bets[a] ?? 0) + p.stack, h.highest + h.lastRaise + Math.floor(rnd() * 3) * 20 + (rnd() < 0.15 ? 5000 : 0)); act = { type: "PLAYER_RAISE", value: to }; }
      let res = g.act(a, act);
      if (!res.ok) res = g.act(a, need > 0 ? { type: "PLAYER_CALL" } : { type: "PLAYER_CHECK" });
      expect(res.ok).toBe(true);
    } else if (h.phase === "ritVote") {
      for (const pid of h.participants) if (h.status[pid] !== "fold" && !(pid in h.ritVotes) && g.st.hand!.phase === "ritVote") g.act(pid, { type: "DRITD", decision: rnd() < 0.7 });
    } else if (h.phase === "idle") {
      g.ok(id("owner"), { kind: "action", action: { type: "NH" } });
    } else if (!g.step()) break;
    if (rnd() < 0.05) { const hn = g.st.hand; if (hn && hn.phase === "result") for (const pid of hn.participants) g.act(pid, { type: rnd() < 0.5 ? "RUC" : "SHOW_HAND", cardToShow: "all" } as never); }
  }
  return { g, done, total };
}

