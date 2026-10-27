// (6/7) hidden-info corner: run-it-twice with "Show All Hands when Bets Finish in All-in" OFF where the run-1 loser wins run 2.
// A winner who never "showed" must not have hole cards exposed through result.hc or the public log.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Peer, startServer, makeTable, mkTmp, sleep } from "./lib/harness.mjs";
import { ok, defect, info, section, finish, waitFor } from "./lib/t.mjs";

const RANKS = "23456789TJQKA", SUITS = "shdc";
const CANON = [...SUITS].flatMap((s) => [...RANKS].map((r) => r + s));
const mk = (prefix) => [...prefix, ...CANON.filter((c) => !prefix.includes(c))];
// heads-up: holes = idx 0,2 (first to be dealt) and 1,3; burn 4; flop 5-7; burn 8; turn 9; burn 10; river 11; run 2: burn 12, flop 13-15, burn 16, turn 17, burn 18, river 19
const deck = mk(["As", "Ks", "Ad", "Kd", "2h", "2c", "3d", "4h", "5c", "7s", "9c", "Jh", "Jd", "Kh", "Kc", "6d", "Qh", "8s", "Qd", "9h"]);
const dir = mkTmp("decks-"); const file = join(dir, "decks.json");
writeFileSync(file, JSON.stringify([{ pre: [0], deck }]));
section("run-it-twice, show-all-off: run-2-only winner");
const S = await startServer({ rotateIp: true, env: { DEV_FIXED_DECKS: file } });
const T = await makeTable(S, ["Alice", "Bob"], { config: { runItTwice: "ask_players", revealAllWhenNoAction: false, showdownTime: "fast" } });
const [a, b] = T.players, [wa, wb] = T.conns;
await T.owner.post(`/games/${T.gameId}/start-game`, {});
await waitFor(() => wa.frame.hand && wb.frame.hand, { timeout: 4000, what: "hand" });
const mine = (w, p) => w.frame.cards[p.id].cards.map((c) => c.value);
const first = mine(wa, a)[0] === "As" ? a : mine(wb, b)[0] === "As" ? b : null;
info("deal", `Alice ${mine(wa, a)} Bob ${mine(wb, b)}`);
const act = async (type, extra) => { for (const [w, p] of [[wa, a], [wb, b]]) if (w.frame.turn.taking === p.id) { w.action(type, extra); return true; } return false; };
const shover = await waitFor(() => [a, b].find((p, i) => [wa, wb][i].frame.turn.taking === p.id), { timeout: 6000, what: "first actor" });
(shover === a ? wa : wb).action("PLAYER_RAISE", { value: 1000 });
const caller = shover === a ? b : a;
await waitFor(() => (caller === a ? wa : wb).frame.turn.taking === caller.id, { timeout: 6000, what: "caller turn" });
(caller === a ? wa : wb).action("PLAYER_CALL");
await waitFor(() => wa.frame.turn.ritWaiting, { timeout: 8000, what: "rit prompt" });
wa.action("DRITD", { decision: true }); wb.action("DRITD", { decision: true });
await waitFor(() => wa.frame.result && wa.frame.hand?.runs === 2, { timeout: 40000, what: "result" });
await sleep(500);
const f = wa.frame; const g = wb.frame;
info("result", JSON.stringify(f.result));
info("showing flags", JSON.stringify({ a: f.cards[a.id].cards, b: f.cards[b.id].cards }));
// Cards belonging to a player who is not "showing" and is not the viewer
const leaks = [];
for (const [viewer, fr, vp, other] of [["Alice", f, a, b], ["Bob", g, b, a]]) {
  const o = fr.cards[other.id].cards; const hole = other === a ? ["Ks", "Kd"] : ["As", "Ad"];
  const notShown = hole.filter((c, i) => !(o[i] && o[i].showing));
  const hc = Object.entries(fr.result ?? {}).filter(([id]) => id === other.id).flatMap(([, r]) => Object.values(r.runs).flatMap((x) => x.hc));
  const exposed = notShown.filter((c) => hc.includes(c));
  if (exposed.length) leaks.push(`${viewer} sees ${other === a ? "Alice" : "Bob"}'s unshown ${exposed} in result.hc`);
}
const lines = (await b.get(`/api/games/${T.gameId}/log_v3?hand_number=1`)).json.map((e) => e.msg); // what BOB (viewer who never saw Alice's cards) can read
const log = lines.join("\n");
const glyph = (c) => c[0].replace("T", "10") + { s: "♠", h: "♥", d: "♦", c: "♣" }[c[1]];
const shownLines = lines.filter((l) => /shows a/.test(l));
for (const c of ["As", "Ad", "Ks", "Kd"]) if (log.includes(glyph(c)) && !shownLines.some((l) => l.includes(glyph(c)))) leaks.push(`public log mentions ${c} without a 'shows' line`);
info("log lines with cards", lines.filter((l) => /combination|shows/.test(l)).map((l) => l.slice(0, 160)).join(" | ").slice(0, 600));
defect("c-rit-result-leak.unshown-winner", "c-rit-result-leak", leaks.length === 0, leaks.join("; "));
await S.stop();
finish("s06a-rit-leak");
