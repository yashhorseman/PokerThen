// (6) hidden-information fuzz against the REAL built server with the REAL engine and crypto shuffles.
// Many tables x random bots (fold / check / call / raise / all-in, run-it-twice votes, rabbit hunts, show / muck, show-all on and off).
// Ground truth (deck, master salt, hole cards) is read by this test from state.json (it is the operator's view).
// Oracles: every reconstructed frame (structure-aware), every raw WS message and every HTTP body each viewer can fetch.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Peer, startServer, makeTable, fakeIp, fileMode, oct, listFiles, rawHttp, sleep } from "./lib/harness.mjs";
import { ok, defect, info, section, finish } from "./lib/t.mjs";

const TABLES = Number(process.env.FUZZ_TABLES ?? 20), HANDS = Number(process.env.FUZZ_HANDS ?? 12), LIMIT_MS = Number(process.env.FUZZ_MS ?? 170000);
const RANK = "23456789TJQKA", SUIT = "shdc";
const GLYPH = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
const glyphCards = (text) => [...text.matchAll(/(10|[2-9JQKA])([♠♥♦♣])/g)].map((m) => (m[1] === "10" ? "T" : m[1]) + GLYPH[m[2]]);
const codeCards = (text) => [...text.matchAll(/"([2-9TJQKA][shdc])"/g)].map((m) => m[1]);
const hex64 = (text) => [...text.matchAll(/\b[0-9a-f]{64}\b/g)].map((m) => m[0]);
const rnd = (n) => Math.floor(Math.random() * n);
const { cardSalt } = await (await import("./lib/harness.mjs")).importFromRoot("packages/shared/src/index.ts");

const S = await startServer({ rotateIp: true });
const viol = []; const note = (m) => { if (viol.length < 25) viol.push(m); };
let frames = 0, bytes = 0, httpBodies = 0, handsSeen = 0;

class Table {
  constructor(i) { this.rabbitEnabled = true; this.i = i; this.truth = new Map(); this.checks = []; this.done = false; this.hands = 0; }
  async setup() {
    const names = ["Ann", "Bo", "Cy", "Di"]; this.names = names;
    const cfg = { runItTwice: "ask_players", rabbitHunt: true, showdownTime: "fast", revealAllWhenNoAction: this.i % 2 === 0, blindLevels: [{ sb: 50, bb: 100, ante: null, durationMin: null }], decisionLimitSec: 20 };
    const t = await makeTable(S, names, { config: cfg, stack: 1000 });
    Object.assign(this, t);
    this.watcher = new Peer(S, "watch"); this.wconn = this.watcher.ws(this.gameId); await this.wconn.registered();
    this.viewers = [...t.players.map((p, k) => ({ p, c: t.conns[k], name: names[k] })), { p: this.watcher, c: this.wconn, name: "watcher" }];
    for (const v of this.viewers) v.c.onMessage = (_m, raw, c) => { frames++; bytes += raw.length; this.checks.push({ viewer: v, raw, frame: c.frame, no: c.frame?.table?.handNumber ?? 0 }); };
    this.poll = setInterval(() => this.readTruth(), 40);
    await this.owner.post(`/games/${this.gameId}/start-game`, {});
  }
  readTruth() {
    try {
      const st = JSON.parse(readFileSync(join(S.dataDir, "tables", this.gameId, "state.json"), "utf8")).state; const h = st.hand;
      if (h && !this.truth.has(h.number)) this.truth.set(h.number, { deck: h.deck, salt: h.masterSalt, holes: h.holes, id: h.id, n: h.participants.length });
      if (h && h.number > this.hands) this.hands = h.number;
    } catch { /* mid-rename */ }
  }
  act() {
    for (const v of this.viewers.slice(0, 4)) {
      const f = v.c.frame; if (!f) continue;
      const id = v.p.id;
      if (f.turn.taking === id && f.hand) {
        const bets = f.hand.bets, my = typeof bets[id] === "number" ? bets[id] : 0, need = f.hand.highestBet - my, behind = f.players[id].stack - my, r = Math.random();
        if (need === 0) v.c.action(r < 0.6 ? "PLAYER_CHECK" : "PLAYER_RAISE", r < 0.6 ? {} : { value: my + Math.max(100, rnd(behind + 1)) });
        else if (r < 0.2) v.c.action("PLAYER_FOLD"); else if (r < 0.5) v.c.action("PLAYER_CALL");
        else if (r < 0.8) v.c.action("PLAYER_RAISE", { value: f.hand.highestBet + Math.max(100, rnd(behind + 1)) }); else v.c.action("PLAYER_RAISE", { value: my + behind });
      }
      if (f.turn.ritWaiting && f.hand?.inHandIds?.includes(id) && f.hand.playerStatus[id] !== "fold" && !(f.turn.ritVotes ?? {})[id]) v.c.action("DRITD", { decision: Math.random() < 0.7 });
      if (f.result && Math.random() < 0.08) v.c.action("SHOW_HAND", { cardToShow: Math.random() < 0.6 ? "all" : (f.cards[id]?.cards?.[0]?.value ?? "all") });
      if (f.rabbit?.enabled && f.result && Math.random() < 0.1) v.c.action("RUC");
    }
    const f = this.conns[0].frame;
    if (f && f.table.status === "waiting") this.refill(f);
  }
  async refill(f) {
    if (this.refilling) return; this.refilling = true;
    try {
      for (const [k, v] of this.viewers.slice(1, 4).entries()) {
        const seated = f.seats.some(([, id]) => id === v.p.id);
        if (!seated && f.players[v.p.id]?.status !== "requestedGameIngress") { await v.p.ingress(this.gameId, k + 2, this.names[k + 1], 1000); await this.owner.post(`/games/${this.gameId}/approve_player`, { playerID: v.p.id }); }
      }
      await this.owner.post(`/games/${this.gameId}/start-game`, {});
    } finally { this.refilling = false; }
  }
}
section(`playing ${TABLES} tables x ${HANDS} hands against the real server`);
const tables = []; for (let i = 0; i < TABLES; i++) { const t = new Table(i); await t.setup(); tables.push(t); }
const t0 = Date.now();
const driver = setInterval(() => { for (const t of tables) t.act(); }, 120);
while (Date.now() - t0 < LIMIT_MS && tables.some((t) => t.hands < HANDS)) await sleep(500);
clearInterval(driver);
await sleep(5000); // let the last results / reveals land
for (const t of tables) { t.readTruth(); }
handsSeen = tables.reduce((a, t) => a + t.hands, 0);
info("played", `${handsSeen} hands on ${TABLES} tables in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${frames} WS messages (${(bytes / 1e6).toFixed(1)} MB) captured`);
ok("enough hands were played for the statistics to mean something", handsSeen >= Math.min(100, TABLES * HANDS * 0.4), `${handsSeen}`);

section("oracle 1: every reconstructed frame, structure-aware");
let frameChecks = 0, allIns = 0, rits = 0, rabbits = 0, shows = 0;
for (const t of tables) for (const ck of t.checks) {
  const f = ck.frame; if (!f || !f.hand) continue; frameChecks++;
  const tr = t.truth.get(f.hand.handNumber); const vid = ck.viewer.p.id; const label = `t${t.i}/${ck.viewer.name}/h${f.hand.handNumber}`;
  if (f.hand.runs === 2) rits++;
  const myHoles = (f.cards[vid]?.cards ?? []).map((c) => c.value).filter(Boolean);
  const shown = (pid) => (f.cards[pid]?.cards ?? []).filter((c) => c.showing && c.value).map((c) => c.value);
  for (const [pid, e] of Object.entries(f.cards)) {
    for (const [k, s] of e.cards.entries()) {
      if (s.value !== null && pid !== vid && !s.showing) note(`${label}: slot ${k} of ${pid} carries ${s.value} but showing=false`);
      if (s.value !== null && tr && pid !== vid && !s.showing) note(`   (truth: ${JSON.stringify(tr.holes[pid])})`);
      if (s.showing) shows++;
    }
    if (pid !== vid && (e.name1 || e.name2 || e.prob1 !== undefined) && !(e.cards.length === 2 && e.cards.every((c) => c.showing))) note(`${label}: ${pid} hand name/equity visible without both cards showing`);
  }
  const board = [...(f.hand.board["1"] ?? []), ...(f.hand.board["2"] ?? [])];
  const known = new Set([...board, ...myHoles, ...Object.keys(f.cards).flatMap((p) => shown(p))]);
  for (const [pid, r] of Object.entries(f.result ?? {})) for (const [run, x] of Object.entries(r.runs)) for (const c of x.hc) if (!known.has(c)) note(`${label}: result[${pid}].runs[${run}].hc exposes ${c} which is neither board, shown, nor the viewer's own`);
  if (f.rabbit?.cards && !(f.rabbit.hunters ?? []).includes(vid)) note(`${label}: rabbit cards sent to a non-hunter`); else if (f.rabbit?.cards) rabbits++;
  if (tr) {
    const n = tr.n; const b1 = f.hand.board["1"] ?? []; const expect = [tr.deck[2 * n + 1], tr.deck[2 * n + 2], tr.deck[2 * n + 3], tr.deck[2 * n + 5], tr.deck[2 * n + 7]].slice(0, b1.length);
    if (JSON.stringify(b1) !== JSON.stringify(expect)) note(`${label}: run-1 board ${b1} != dealt positions ${expect}`);
    const burns = new Set([tr.deck[2 * n], tr.deck[2 * n + 4], tr.deck[2 * n + 6]]);
    for (const c of board) if (burns.has(c) && !(f.hand.runs === 2)) note(`${label}: burn card ${c} on the board`);
    if (ck.raw.includes(tr.salt)) note(`${label}: master salt present in a WS message`);
    for (let i = 0; i < 52; i++) if (ck.raw.includes(cardSalt(tr.salt, i))) { note(`${label}: per-card salt #${i} present in a WS message`); break; }
    if (ck.raw.includes('"deck"')) note(`${label}: a "deck" key in a WS message`);
    // viewer's own cards match the truth
    if (vid in tr.holes) { const own = (f.cards[vid]?.cards ?? []).map((c) => c.value).filter(Boolean); if (own.length && own.some((c) => !tr.holes[vid].includes(c))) note(`${label}: own holes ${own} != truth ${tr.holes[vid]}`); }
    // anything else that looks like a card in the raw JSON must be explainable by the viewer's entitlement
    const rab = new Set(f.rabbit?.cards?.["1"] ?? []);
    for (const c of codeCards(ck.raw)) if (!known.has(c) && !rab.has(c)) note(`${label}: card ${c} in a raw WS message is not explained by the viewer's entitlement`);
  }
}
info("frames checked", `${frameChecks} (run-it-twice frames ${rits}, showing slots ${shows}, rabbit frames to hunters ${rabbits})`);
ok("no frame ever carried a card its viewer may not know", viol.length === 0, viol.slice(0, 6).join(" | "));

section("oracle 2: HTTP bodies each viewer can fetch (log_v3, CSVs, ledger, fairness, config, healthz, errors)");
let httpCards = 0, fairRevealed = 0, fairPending = 0;
for (const t of tables) {
  for (const ck of t.viewers) {
    const vid = ck.p.id;
    const bodies = []; const get = async (path, hand) => { const r = await ck.p.get(path); httpBodies++; bodies.push({ path, hand, r }); return r; };
    for (let n = 1; n <= t.hands; n++) { await get(`/api/games/${t.gameId}/log_v3?hand_number=${n}`, n); await get(`/api/games/${t.gameId}/fairness/${n}`, n); }
    await get(`/games/${t.gameId}/players_sessions`); await get(`/games/${t.gameId}/current_or_next_configs`); await get(`/games/${t.gameId}/ledger_${t.gameId}.csv`); await get(`/games/${t.gameId}/pokerthen_log_${t.gameId}.csv`);
    await get(`/games/${t.gameId}/players_sessions/${vid}`); await get(`/games/${t.gameId}/players/${vid}`); await get(`/api/games/${t.gameId}/log_v3?hand_number=zzz`); await get(`/games/${t.gameId}/nope`); await get(`/nonsense`); await get(`/healthz`);
    for (const b of bodies) {
      if (b.hand === undefined) { const tx = b.r.text; if (codeCards(tx).length || glyphCards(tx).length && !/pokerthen_log/.test(b.path)) note(`t${t.i}/${ck.name}: ${b.path} carries card text`); if (/pokerthen_log/.test(b.path)) continue; if (hex64(tx).length) note(`${b.path} carries a 64-hex value`); continue; }
      const tr = t.truth.get(b.hand); if (!tr) continue;
      const label = `t${t.i}/${ck.name}/${b.path.split("?")[0].split("/").slice(-2).join("/")}#${b.hand}`;
      if (b.r.text.includes(tr.salt)) note(`${label}: master salt served`);
      if (/log_v3/.test(b.path) && b.r.status === 200) {
        const lines = b.r.json.map((e) => e.msg);
        const own = tr.holes[vid] ?? [];
        const publicCards = new Set();
        for (const l of lines) {
          const cs = glyphCards(l); httpCards += cs.length;
          if (/^Your hand is/.test(l)) { if (cs.some((c) => !own.includes(c))) note(`${label}: 'Your hand is' shows ${cs} but the viewer holds ${own}`); }
          else if (/^Undealt cards/.test(l)) { /* hunter only; checked below via who asked */ }
          else if (/^(Flop|Turn|River)/.test(l) || / shows a /.test(l)) cs.forEach((c) => publicCards.add(c));
          else if (/\(combination/.test(l)) { /* checked after the loop */ }
          else if (cs.length) note(`${label}: unexpected card text in line '${l.slice(0, 80)}'`);
        }
        for (const l of lines) if (/\(combination/.test(l)) for (const c of glyphCards(l)) if (!publicCards.has(c) && !own.includes(c)) note(`${label}: winner line exposes ${c} that nobody showed: '${l.slice(0, 100)}'`);
        if (lines.filter((l) => /^Your hand is/.test(l)).length > 1) note(`${label}: more than one 'Your hand is' line`);
        // undealt lines only for hunters
        const und = lines.filter((l) => /^Undealt cards/.test(l)); if (und.length && ck.name === "watcher") note(`${label}: watcher received an Undealt-cards line`);
      }
      if (/fairness/.test(b.path) && b.r.status === 200) {
        const rec = b.r.json; const tx = b.r.text;
        if (!rec.commitment || tx.includes('"deck"') || tx.includes("masterSalt")) note(`${label}: fairness body has deck/masterSalt or no commitment`);
        if (rec.reveal) {
          fairRevealed++;
          const idx = rec.reveal.cards.map((c) => c.index);
          for (const c of rec.reveal.cards) { if (tr.deck[c.index] !== c.card) note(`${label}: revealed card ${c.card}@${c.index} is not the committed deck card ${tr.deck[c.index]}`); if (c.salt !== cardSalt(tr.salt, c.index)) note(`${label}: revealed salt wrong @${c.index}`); }
          for (let i = 0; i < 52; i++) if (!idx.includes(i) && tx.includes(cardSalt(tr.salt, i))) note(`${label}: salt of UNEXPOSED position ${i} published`);
          // exposure derived independently from the public log (as seen by this viewer, public lines only)
          const lg = t.logFor?.get(b.hand);
          t.revealed ??= new Map(); t.revealed.set(b.hand, { idx, rec });
        } else fairPending++;
      }
    }
    // status of error bodies: never 5xx
    for (const b of bodies) if (b.r.status >= 500) note(`t${t.i}/${ck.name}: ${b.path} -> ${b.r.status}`);
  }
}
info("http", `${httpBodies} bodies scanned, ${httpCards} card glyphs read from logs; fairness records with reveal ${fairRevealed}, still pending ${fairPending}`);
ok("no HTTP body leaked a card, salt, deck or foreign 'Your hand' line", viol.length === 0, viol.slice(0, 6).join(" | "));

section("oracle 3: the published reveal contains exactly the cards that were exposed (derived from the public log)");
let exact = 0, mism = [];
for (const t of tables) {
  const watcher = t.watcher;
  for (const [n, rv] of t.revealed ?? []) {
    const tr = t.truth.get(n); const lg = (await watcher.get(`/api/games/${t.gameId}/log_v3?hand_number=${n}`)).json.map((e) => e.msg);
    const pub = new Set(); for (const l of lg) if (/^(Flop|Turn|River)/.test(l) || / shows a /.test(l)) glyphCards(l).forEach((c) => pub.add(c));
    const exposedIdx = [...pub].map((c) => tr.deck.indexOf(c)).sort((a, b) => a - b);
    const revIdx = [...rv.idx].sort((a, b) => a - b);
    const rabbit = lg.some((l) => /^Undealt/.test(l)); // watcher never sees them; hunters' cards are extra positions
    const extra = revIdx.filter((i) => !exposedIdx.includes(i)), missing = exposedIdx.filter((i) => !revIdx.includes(i));
    if (missing.length || (extra.length && !t.rabbitEnabled)) {
      // extra positions are legitimate only for rabbit hunts (indices after the last dealt board position)
      const lastBoard = Math.max(-1, ...[...pub].map((c) => tr.deck.indexOf(c)));
      const bad = extra.filter((i) => i < lastBoard && !pub.has(tr.deck[i]));
      if (missing.length || bad.length) mism.push(`t${t.i}#${n}: missing ${missing} extra ${bad}`); else exact++;
    } else exact++;
  }
}
ok(`reveal == publicly exposed cards for all ${exact + mism.length} revealed hands (rabbit extras allowed)`, mism.length === 0, mism.slice(0, 5).join(" | "));
const unexposedPublished = [];
for (const t of tables) for (const [n, rv] of t.revealed ?? []) { const tr = t.truth.get(n); const holes = Object.entries(tr.holes); const seatedHoleIdx = new Set(rv.rec.reveal.usage.filter((u) => u.kind === "burn").flatMap((u) => u.indices)); for (const c of rv.rec.reveal.cards) if (seatedHoleIdx.has(c.index)) unexposedPublished.push(`t${t.i}#${n}: burn position ${c.index} published`); }
ok("burn positions are never revealed", unexposedPublished.length === 0, unexposedPublished.slice(0, 4).join(" | "));

section("on-disk secrecy");
{
  const files = listFiles(join(S.dataDir)); const bad = [];
  for (const f of files) { const m = fileMode(f); if ((m & 0o077) !== 0) bad.push(`${f.split("/").slice(-3).join("/")} ${oct(m)}`); }
  ok(`all ${files.length} files under DATA_DIR are owner-only (0600/0700)`, bad.length === 0, bad.slice(0, 5).join(", "));
  const t = tables[0]; ok("state.json mode 0600", fileMode(join(S.dataDir, "tables", t.gameId, "state.json")) === 0o600, oct(fileMode(join(S.dataDir, "tables", t.gameId, "state.json"))));
  const probes = ["/state.json", `/tables/${t.gameId}/state.json`, `/../tables/${t.gameId}/state.json`, `/%2e%2e/tables/${t.gameId}/state.json`, `/..%2ftables/${t.gameId}/state.json`, `/assets/../../tables/${t.gameId}/state.json`, `/%252e%252e/state.json`, "/..\\state.json", "/%2e%2e%5c%2e%2e%5cetc%5cpasswd", "/etc/passwd", "/..%00/etc/passwd", "//etc/passwd", "/assets/%2e%2e/%2e%2e/server.cjs", "/server.cjs", "/package.json", "/.env", "/log.jsonl", "/fairness.jsonl"];
  const served = [];
  for (const p of probes) { const r = await rawHttp(S, { path: p, headers: { "x-forwarded-for": fakeIp() } }); if (r.status === 200 && !/<div id="?root"?/.test(r.text) && !/^<!doctype/i.test(r.text.trim())) served.push(`${p} -> 200 ${r.text.slice(0, 40)}`); if (r.text.includes('"masterSalt"') || r.text.includes("root:")) served.push(`${p} leaked content`); }
  ok("static path traversal (plain, encoded, double-encoded, backslash, NUL) never reaches DATA_DIR or the filesystem", served.length === 0, served.join(" | "));
}
ok("no prototype pollution during the fuzz", S.pollution() === "", S.pollution());
ok("server survived the fuzz without errors in its log", !S.exited && !/uncaught|unhandled|engine\.command threw|engine\.tick threw/i.test(S.logs()), (S.logs().match(/(uncaught|unhandled|threw)[^\n]*/i) ?? [""])[0]);
for (const t of tables) clearInterval(t.poll);
await S.stop();
if (viol.length) console.log("\nviolations:\n  " + viol.join("\n  "));
finish("s06-leak-fuzz");
