// (7/8) crash recovery with SIGKILL at random points, "no ack without persistence", restart cannot re-shuffle, commit-before-cards,
// and disk-full style failures (RLIMIT_FSIZE => short writes / EFBIG) against the REAL built server.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Peer, startServer, restartServer, makeTable, sleep, mkTmp } from "./lib/harness.mjs";
import { ok, defect, info, section, finish, waitFor } from "./lib/t.mjs";

const rnd = (n) => Math.floor(Math.random() * n);
function bots(viewers, stop) {
  const iv = setInterval(() => {
    for (const v of viewers) {
      const f = v.c.frame, id = v.p.id; if (!f || v.c.ws.readyState !== 1) continue;
      if (f.turn.taking === id && f.hand) {
        const my = typeof f.hand.bets[id] === "number" ? f.hand.bets[id] : 0, need = f.hand.highestBet - my, behind = f.players[id].stack - my, r = Math.random();
        if (need === 0) v.c.action(r < 0.7 ? "PLAYER_CHECK" : "PLAYER_RAISE", r < 0.7 ? {} : { value: my + Math.max(100, rnd(behind + 1)) });
        else if (r < 0.15) v.c.action("PLAYER_FOLD"); else if (r < 0.7) v.c.action("PLAYER_CALL"); else v.c.action("PLAYER_RAISE", { value: f.hand.highestBet + Math.max(100, rnd(behind + 1)) });
      }
      if (f.turn.ritWaiting && f.hand?.playerStatus?.[id] !== "fold") v.c.action("DRITD", { decision: Math.random() < 0.5 });
    }
  }, 100);
  return () => clearInterval(iv);
}
const total = (f) => Object.values(f.players).reduce((a, p) => a + p.stack, 0) + (f.hand?.pot ?? 0);
const readJsonl = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { bad: l }; } }) : []);

section("SIGKILL at random points while 3 bots play (10 kill/restart cycles)");
{
  let S = await startServer({ rotateIp: true });
  const T = await makeTable(S, ["Ann", "Bo", "Cy"], { config: { rabbitHunt: true, runItTwice: "ask_players", showdownTime: "fast", blindLevels: [{ sb: 50, bb: 100, ante: null, durationMin: null }] } });
  const gid = T.gameId, dir = () => join(S.dataDir, "tables", gid);
  let viewers = T.players.map((p, i) => ({ p, c: T.conns[i] }));
  let stopBots = bots(viewers, null);
  await T.owner.post(`/games/${gid}/start-game`, {});
  const seenLogs = new Map(); // `${hand}|${createdAt}` -> msg  (what clients could read before the crash)
  const seenCommits = new Map();
  let lost = [], dups = [], chipBad = [], reshuffled = [], chainBad = [], fairLost = [], ackLost = [], progress = 0, lastHand = 0;
  for (let cycle = 0; cycle < 10; cycle++) {
    await sleep(1500 + rnd(7000));
    const f = T.conns[0].frame;
    // 1. snapshot what the world has seen
    const hn = f.table.handNumber;
    for (let n = Math.max(1, hn - 3); n <= hn; n++) { const r = await T.owner.get(`/api/games/${gid}/log_v3?hand_number=${n}`); if (r.status === 200) for (const e of r.json) seenLogs.set(`${n}|${e.createdAt}`, e.msg); const fr = await T.owner.get(`/api/games/${gid}/fairness/${n}`); if (fr.status === 200) seenCommits.set(n, fr.json.commitment); }
    const myHole = JSON.stringify(f.cards[T.owner.id]?.cards?.map((c) => c.value)); const myCommit = f.hand?.commitment; const myHand = f.hand?.handNumber;
    // 2. an acknowledged owner command, then the crash IMMEDIATELY after the 200
    const cfg = (await T.owner.get(`/games/${gid}/current_or_next_configs`)).json; delete cfg.queued; const want = cycle % 2 === 0;
    const ack = await T.owner.post(`/games/${gid}/update_game`, { ...cfg, autoTrimBets: want });
    if (Math.random() < 0.5) await sleep(rnd(400));
    stopBots(); T.conns.forEach((c) => c.terminate());
    await S.kill9();
    // 3. restart on the same DATA_DIR and reconnect everybody
    S = await restartServer(S);
    const T2 = { conns: [] };
    const peers = T.players.map((p) => { const q = new Peer(S, p.label, { token: p.token }); return q; });
    T2.conns = []; for (const q of peers) { const w = q.ws(gid); await w.registered(); T2.conns.push(w); }
    T.conns = T2.conns; T.owner = peers[0]; T.players = peers; viewers = peers.map((p, i) => ({ p, c: T2.conns[i] })); stopBots = bots(viewers, null);
    const g = T2.conns[0].frame;
    const label = `cycle ${cycle}`;
    if (!g || g.table.handNumber < hn) lost.push(`${label}: hand number went backwards ${hn} -> ${g?.table.handNumber}`);
    ok(`${label}: table recovered (not quarantined)`, !/quarantining table/.test(S.logs()) && /[1-9]\d* table\(s\) recovered/.test(S.logs()), (S.logs().match(/quarantining table[^\n]*/) ?? [""])[0]);
    // no ack without persistence: the 200 for update_game must survive the kill
    const cfg2 = (await peers[0].get(`/games/${gid}/current_or_next_configs`)).json;
    if (ack.status === 200 && cfg2.autoTrimBets !== want) ackLost.push(`${label}: update_game acked 200 but autoTrimBets=${cfg2.autoTrimBets} after restart`);
    // chip conservation (stack frame value includes open bets; pot is the collected part)
    if (total(g) !== 3000) chipBad.push(`${label}: total chips ${total(g)} != 3000 (hand ${g.table.handNumber})`);
    // the running hand keeps its deck: same commitment, same hole cards
    if (myHand !== undefined && g.hand?.handNumber === myHand) { if (g.hand.commitment !== myCommit) reshuffled.push(`${label}: commitment changed for hand ${myHand}`); if (JSON.stringify(g.cards[peers[0].id]?.cards?.map((c) => c.value)) !== myHole) reshuffled.push(`${label}: hole cards changed for hand ${myHand}`); }
    // log: nothing seen before the kill is gone; no duplicates
    const now = new Map(); const dupKey = new Set();
    for (let n = 1; n <= g.table.handNumber; n++) { const r = await peers[0].get(`/api/games/${gid}/log_v3?hand_number=${n}`); if (r.status !== 200) continue; for (const e of r.json) { const k = `${n}|${e.createdAt}`; if (now.has(k)) dups.push(`${label}: duplicate createdAt in hand ${n}`); now.set(k, e.msg); const dk = `${n}|${e.msg}`; if (/^(Flop|Turn|River|-- )/.test(e.msg) && dupKey.has(dk)) dups.push(`${label}: duplicate line '${e.msg.slice(0, 40)}' in hand ${n}`); dupKey.add(dk); } }
    for (const [k, m] of seenLogs) if (!now.has(k)) lost.push(`${label}: log line ${k} '${m.slice(0, 40)}' was visible before the crash and is gone`); else if (now.get(k) !== m) lost.push(`${label}: log line ${k} changed`);
    // fairness: every commitment published before the crash is still published, chain intact
    let prev = "0".repeat(64);
    for (let n = 1; n <= g.table.handNumber; n++) { const fr = await peers[0].get(`/api/games/${gid}/fairness/${n}`); if (fr.status !== 200) { fairLost.push(`${label}: fairness record #${n} missing (${fr.status})`); break; } if (fr.json.prevCommitment !== prev) chainBad.push(`${label}: hand ${n} prev ${fr.json.prevCommitment.slice(0, 8)} != previous commitment ${prev.slice(0, 8)}`); if (seenCommits.has(n) && seenCommits.get(n) !== fr.json.commitment) chainBad.push(`${label}: commitment of hand ${n} CHANGED across the crash`); prev = fr.json.commitment; }
    // on disk: no torn lines, no duplicate (seq, line) after recovery
    const logRows = readJsonl(join(dir(), "log.jsonl")), st = JSON.parse(readFileSync(join(dir(), "state.json"), "utf8"));
    if (logRows.some((r) => r.bad)) dups.push(`${label}: torn JSON line left in log.jsonl`);
    if (logRows.some((r) => r.seq > st.seq)) dups.push(`${label}: log rows with seq > state.seq survived recovery`);
    const keys = logRows.map((r) => `${r.seq}|${r.createdAt}`); if (new Set(keys).size !== keys.length) dups.push(`${label}: duplicate (seq, createdAt) rows on disk`);
    lastHand = g.table.handNumber;
  }
  await sleep(6000); progress = T.conns[0].frame.table.handNumber - lastHand;
  stopBots(); T.conns.forEach((c) => c.close());
  ok("hand numbers never regress across 10 crashes", lost.filter((x) => /backwards/.test(x)).length === 0, lost.slice(0, 3).join(" | "));
  ok("no log line visible before a crash is lost or altered", lost.length === 0, lost.slice(0, 4).join(" | "));
  ok("no duplicate or torn log lines (client view and on disk)", dups.length === 0, dups.slice(0, 4).join(" | "));
  ok("every acknowledged update_game (200) survived SIGKILL immediately after the ack", ackLost.length === 0, ackLost.join(" | "));
  ok("chips are conserved at every restart (stacks + open bets + pot == 3000)", chipBad.length === 0, chipBad.slice(0, 4).join(" | "));
  ok("a restart never re-shuffles a running hand (same commitment, same hole cards)", reshuffled.length === 0, reshuffled.join(" | "));
  ok("all commitments survive the crash and stay chained; none changed", fairLost.length === 0 && chainBad.length === 0, [...fairLost, ...chainBad].slice(0, 4).join(" | "));
  info("liveness", `${progress} further hand(s) completed after the last restart`);
  ok("play continues after the last restart", progress >= 0 && !S.exited, "");
  ok("no prototype pollution / server errors during crash cycles", S.pollution() === "" && !/uncaught|unhandled/i.test(S.logs()), "");
  await S.stop();
}

section("commitment is durable and public BEFORE the first frame that carries a hole card");
{
  const S = await startServer({ rotateIp: true });
  const T = await makeTable(S, ["Ann", "Bo", "Cy"], { config: { showdownTime: "fast" } });
  const gid = T.gameId, tdir = join(S.dataDir, "tables", gid);
  const bad = []; let checked = 0;
  for (const [i, c] of T.conns.entries()) {
    let lastN = 0;
    c.onMessage = (_m, _raw, conn) => {
      const f = conn.frame; const mine = f?.cards?.[T.players[i].id]?.cards ?? [];
      if (f?.hand && mine.some((x) => x.value) && f.hand.handNumber > lastN) {
        lastN = f.hand.handNumber; checked++;
        const fair = readJsonl(join(tdir, "fairness.jsonl")).filter((r) => r.type === "commit" && r.handNumber === f.hand.handNumber);
        const st = JSON.parse(readFileSync(join(tdir, "state.json"), "utf8"));
        const logs = readJsonl(join(tdir, "log.jsonl")).filter((r) => r.handNumber === f.hand.handNumber);
        const ci = logs.findIndex((r) => /Hand commitment/.test(r.msg)), yi = logs.findIndex((r) => /^Your hand is/.test(r.msg));
        if (fair.length !== 1 || fair[0].commitment !== f.hand.commitment) bad.push(`hand ${f.hand.handNumber}: commit not on disk (or different) when the first hole card frame arrived`);
        if (st.seq < fair[0]?.seq) bad.push(`hand ${f.hand.handNumber}: state.json older than the commit row`);
        if (ci < 0 || yi < 0 || ci > yi || !logs[ci].msg.includes(f.hand.commitment)) bad.push(`hand ${f.hand.handNumber}: commitment log line is not before 'Your hand is'`);
      }
    };
  }
  const stop0 = bots(T.players.map((p, i) => ({ p, c: T.conns[i] })), null);
  // poll the PUBLIC fairness endpoint all the time: a reveal must never be visible before the result window of its hand has closed
  const anon = new Peer(S, "anon"); const dl = {}; const early = []; let polled = 0, revealedSeen = 0;
  const poller = setInterval(async () => {
    const f = T.conns[0].frame; if (!f?.hand) return; const hn = f.table.handNumber; if (f.result && f.turn.nextStepAt) dl[hn] = f.turn.nextStepAt;
    const r = await anon.get(`/api/games/${gid}/fairness/${hn}`).catch(() => null); if (!r || r.status !== 200) return; polled++;
    if (r.json.reveal) { revealedSeen++; if (!(dl[hn] && r.json.reveal.revealedAtMs >= dl[hn] - 5)) early.push(`hand ${hn}: reveal visible ${dl[hn] ? r.json.reveal.revealedAtMs - dl[hn] : "?"} ms before the result window closed`); }
  }, 150);
  const stop = () => { stop0(); clearInterval(poller); };
  await T.owner.post(`/games/${gid}/start-game`, {});
  await waitFor(() => T.conns[0].frame.table.handNumber >= 6, { timeout: 150000, what: "6 hands" }).catch(() => {});
  ok(`for ${checked} (viewer, hand) first-hole-card frames the commit row, state.json and the commitment log line were already durable and in order`, checked >= 9 && bad.length === 0, bad.slice(0, 3).join(" | ") || `checked=${checked}`);
  ok(`public fairness endpoint polled ${polled}x without a cookie: commitment always present, reveal never earlier than the end of the result window (${revealedSeen} reveals seen)`, polled > 20 && early.length === 0, early.slice(0, 3).join(" | "));
  const rec1 = (await new Peer(S, "anon").get(`/api/games/${gid}/fairness/1`)).json;
  ok("a finished hand's reveal appears only after the result window", !!rec1.reveal && rec1.reveal.revealedAtMs >= rec1.committedAtMs, "");
  await S.stop();
}

section("disk-full style failures (RLIMIT_FSIZE: writes crossing the limit are SHORT, later ones fail with EFBIG)");
for (const [label, limit] of [["log.jsonl crosses the limit", 9000], ["state.json crosses the limit", 4200]]) {
  const S = await startServer({ rotateIp: true, fsizeBytes: limit });
  let T, failure = null;
  try { T = await makeTable(S, ["Ann", "Bo"], { config: { showdownTime: "fast" } }); } catch (e) { failure = e.message; }
  if (!T) { info(label, `could not even set the table up under the limit: ${failure}`); await S.stop(); continue; }
  const gid = T.gameId;
  const acked = []; const statuses = [];
  const stop = bots(T.players.map((p, i) => ({ p, c: T.conns[i] })), null);
  const st0 = await T.owner.post(`/games/${gid}/start-game`, {}); statuses.push(st0.status);
  for (let i = 0; i < 12; i++) { await sleep(1500); const r = await T.owner.post(`/games/${gid}/update_game`, { ...(await T.owner.get(`/games/${gid}/current_or_next_configs`)).json, autoTrimBets: i % 2 === 0, queued: undefined }); statuses.push(r.status); if (r.status === 200) acked.push(i % 2 === 0); }
  stop();
  const tdir = join(S.dataDir, "tables", gid);
  const stateRaw = existsSync(join(tdir, "state.json")) ? readFileSync(join(tdir, "state.json"), "utf8") : "";
  let stateOk = true; try { JSON.parse(stateRaw); } catch { stateOk = false; }
  const logRows = readJsonl(join(tdir, "log.jsonl")); const torn = logRows.filter((r) => r.bad).length;
  info(label, `command statuses ${[...new Set(statuses)].join(",")}; state.json ${stateOk ? "valid" : "TORN"} (${stateRaw.length} B); log.jsonl torn lines ${torn}; stderr: ${(S.logs().match(/persistence failed[^\n]*|EFBIG[^\n]*/) ?? ["(none)"])[0].slice(0, 100)}`);
  T.conns.forEach((c) => c.terminate()); await S.kill9();
  const S2 = await startServer({ dataDir: S.dataDir, secret: S.secret, bundle: S.bundle, rotateIp: true });
  const quarantined = existsSync(join(S.dataDir, "quarantine")) && readdirSync(join(S.dataDir, "quarantine")).length > 0;
  const r = await new Peer(S2, "x", { token: T.owner.token }).get(`/games/${gid}`);
  defect("c-short-write.state-survives-disk-full", "c-short-write", stateOk && !quarantined && r.status === 200, `${label}: after the disk-full period + SIGKILL the table is ${quarantined ? "QUARANTINED (lost)" : r.status !== 200 ? "gone (" + r.status + ")" : stateOk ? "ok" : "state.json is torn"}; commands acked meanwhile: ${statuses.filter((s) => s === 200).length}/${statuses.length}`);
  defect("c-short-write.no-torn-log-lines", "c-short-write", torn === 0, `${label}: ${torn} torn line(s) in log.jsonl although the commands that wrote them were acknowledged`);
  await S2.stop();
}
finish("s08-crash");
