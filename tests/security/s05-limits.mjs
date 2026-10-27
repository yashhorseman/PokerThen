// (5) rate limits, per-IP socket caps, X-Forwarded-For spoofing, connect/chat floods (disk + CPU amplification), idle sockets.
import { statSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";
import { Peer, WsConn, rawHttp, rawTcp, startServer, makeTable, newToken, fakeIp, sleep } from "./lib/harness.mjs";
import { ok, defect, info, section, finish, waitFor } from "./lib/t.mjs";

const lat = async (S) => { const t = performance.now(); await rawHttp(S, { path: "/healthz" }); return performance.now() - t; };
const size = (p) => { try { return statSync(p).size; } catch { return 0; } };

section("per-IP socket cap, per-socket message cap, HTTP rate limits (direct, no proxy trust)");
{
  const S = await startServer();
  const T = await makeTable(S, ["Alice", "Bob"]);
  const socks = [];
  for (let i = 0; i < 25; i++) { const w = new Peer(S, "s" + i).ws(T.gameId); socks.push(w); await w.outcome(2000); await sleep(15); }
  await sleep(300);
  const refused = socks.filter((w) => w.msgs.some((m) => m.t === "failed" && m.code === "too-many-connections"));
  // Alice + Bob already hold 2 sockets from the same IP
  ok("sockets beyond 20 per IP get `failed too-many-connections` and close 4429", refused.length >= 5 && refused.every((w) => w.closeCode === 4429 || w.closeCode === null), `${refused.length} refused of 25 (+2 already open)`);
  socks.forEach((w) => w.terminate());
  await sleep(200);
  const w = new Peer(S, "burst").ws(T.gameId); await w.registered();
  for (let i = 0; i < 60; i++) w.send({ t: "ping", ts: i });
  await w.closed;
  ok("41+ messages in 2 s close the socket with 4430", w.closeCode === 4430 && w.msgs.some((m) => m.t === "failed" && m.code === "too-many-actions"), `close=${w.closeCode}`);
  const p = new Peer(S, "http"); let c429 = 0, first429 = -1;
  for (let i = 0; i < 140; i++) { const r = await p.post(`/games/${T.gameId}/start-game`, {}); if (r.status === 429) { c429++; if (first429 < 0) first429 = i; } }
  ok("POST burst is limited to ~120 per 10 s (429 afterwards)", c429 > 0 && first429 >= 100 && first429 <= 125, `first 429 at request #${first429}, total ${c429}`);
  await sleep(10500);
  const ng = new Peer(S, "ng"); const codes = [];
  for (let i = 0; i < 13; i++) codes.push((await ng.post("/new-game", { playerName: "Burst" + i })).status);
  ok("/new-game limited to 10 per minute per IP", codes.slice(0, 9).every((s) => s === 200) && codes.slice(9).every((s) => s === 429), codes.join(","));
  const lc = []; for (let i = 0; i < 35; i++) lc.push((await T.owner.get(`/api/games/${T.gameId}/log_v3?hand_number=1`)).status);
  ok("log_v3 limited to 30 per 10 s", lc.includes(429), `${lc.filter((s) => s === 429).length} x 429`);
  const g = []; for (let i = 0; i < 400; i++) g.push(rawHttp(S, { path: `/api/games/${T.gameId}/fairness/1` }).catch(() => ({ status: "reset" })));
  const gs = await Promise.all(g);
  info("GET endpoints other than log/CSV are not rate limited", `400 parallel GET fairness -> ${[...new Set(gs.map((r) => r.status))].join(",")}`);
  await S.stop();
}

section("X-Forwarded-For spoofing behind a trusted proxy (Azure appends the real client address to a client-supplied header)");
{
  const S = await startServer({ env: { TRUST_PROXY: "1" } });
  const real = "203.0.113.50";
  const T = await makeTable(S, ["Alice", "Bob"], { ip: () => real });
  const socks = [];
  for (let i = 0; i < 30; i++) { const peer = new Peer(S, "x" + i, { ip: `${fakeIp()}, ${real}` }); const w = peer.ws(T.gameId); socks.push(w); await w.outcome(2000); await sleep(10); }
  await sleep(300);
  const refused = socks.filter((w) => w.msgs.some((m) => m.t === "failed" && m.code === "too-many-connections")).length;
  defect("c-xff-spoof.socket-cap", "c-xff-spoof", refused > 0, `30 sockets from one real client (${real}) with spoofed leading X-Forwarded-For entries: ${refused} refused => per-IP cap bypassed`);
  socks.forEach((w) => w.terminate());
  const codes = [];
  for (let i = 0; i < 14; i++) codes.push((await rawHttp(S, { method: "POST", path: "/new-game", headers: { origin: S.origin, "content-type": "application/json", "x-forwarded-for": `${fakeIp()}, ${real}` }, body: JSON.stringify({ playerName: "Spoof" + i }) })).status);
  defect("c-xff-spoof.new-game-limit", "c-xff-spoof", codes.includes(429), `14 /new-game from one real client with spoofed X-Forwarded-For: ${codes.join(",")}`);
  await S.stop();
}

section("WebSocket connect flood: every connect/disconnect is an fsync'd state rewrite and every new token adds a permanent player record");
{
  const S = await startServer({ rotateIp: true });
  const T = await makeTable(S, ["Alice", "Bob"]);
  const dir = S.tableDir(T.gameId);
  const s0 = size(join(dir, "state.json")), pl0 = Object.keys(T.conns[0].frame.players).length;
  const l0 = await lat(S);
  const N = 300, t0 = Date.now(); let worst = 0;
  for (let i = 0; i < N; i++) { const w = new Peer(S, "f" + i).ws(T.gameId); await w.registered(); w.close(); if (i % 50 === 0) worst = Math.max(worst, await lat(S)); }
  const dt = Date.now() - t0;
  await sleep(500);
  const s1 = size(join(dir, "state.json"));
  const st = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  const recs = Object.keys(st.state.players).length;
  info("connect flood", `${N} fresh tokens in ${dt} ms (${(N / dt * 1000).toFixed(0)} connects/s); state.json ${s0} -> ${s1} bytes; player records ${pl0} -> ${recs}; seq=${st.seq}; healthz latency ${l0.toFixed(1)} -> worst ${worst.toFixed(1)} ms`);
  defect("c-ws-flood.player-records", "c-ws-flood", recs <= pl0 + 5, `${N} throw-away tokens left ${recs - pl0} permanent watcher records in the table state (persisted + cloned on every command; the owner's frames list them all)`);
  const per = (s1 - s0) / N;
  info("state growth per throw-away token", `${per.toFixed(0)} bytes in state.json (extrapolation: 1M tokens = ${(per * 1e6 / 1e6).toFixed(0)} MB rewritten and fsync'd on every command)`);
  const ownerPlayers = Object.keys(T.conns[0].frame.players).length;
  defect("c-ws-flood.owner-frame", "c-ws-flood", ownerPlayers <= 12, `owner frame carries ${ownerPlayers} player entries`);
  await S.stop();
}

section("chat flood: every message is appended + fsync'd to chat.jsonl forever");
{
  const S = await startServer({ rotateIp: true });
  const T = await makeTable(S, ["Alice", "Bob"]);
  const dir = S.tableDir(T.gameId);
  const spam = []; for (let i = 0; i < 10; i++) { const w = new Peer(S, "c" + i).ws(T.gameId); await w.registered(); spam.push(w); }
  const c0 = size(join(dir, "chat.jsonl")); const t0 = Date.now(); let worst = 0;
  const timer = setInterval(async () => { worst = Math.max(worst, await lat(S)); }, 200);
  for (let round = 0; round < 25; round++) { for (const w of spam) for (let k = 0; k < 8; k++) w.chat("x".repeat(100)); await sleep(100); }
  await sleep(1000); clearInterval(timer);
  const c1 = size(join(dir, "chat.jsonl")); const lines = readFileSync(join(dir, "chat.jsonl"), "utf8").split("\n").filter(Boolean).length;
  const dt = (Date.now() - t0) / 1000;
  info("chat flood", `10 sockets, ${lines} messages persisted in ${dt.toFixed(1)} s (${(lines / dt).toFixed(0)} msg/s), chat.jsonl ${c0} -> ${c1} bytes (${(c1 / dt / 1024).toFixed(1)} KB/s => ${(c1 / dt * 86400 / 1e9).toFixed(1)} GB/day), healthz worst ${worst.toFixed(0)} ms`);
  defect("c-chat-flood.per-player-limit", "c-chat-flood", lines <= 100, `no per-player chat rate limit and no cap on chat.jsonl: ${lines} messages persisted in ${dt.toFixed(1)} s from 10 throw-away watchers`);
  await S.stop();
}

section("table creation footprint (no retention policy)");
{
  const S = await startServer({ rotateIp: true });
  await new Peer(S, "t").newGame("Disk");
  const dir = S.dataDir; const files = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); e.isDirectory() ? walk(p) : files.push([p, statSync(p).size]); } }; walk(join(dir, "tables"));
  const total = files.reduce((a, [, n]) => a + n, 0);
  info("one empty table on disk", `${total} bytes in ${files.length} file(s); at 10 tables/min/IP (and unlimited with XFF spoofing) the disk fills with abandoned tables: no GC, no global cap`);
  const codes = []; for (let i = 0; i < 40; i++) codes.push((await new Peer(S, "t" + i, { ip: fakeIp() }).post("/new-game", { playerName: "Bulk" + i })).status);
  info("global table cap", `LIMITS.MAX_TABLES=3000 (registry.create throws beyond it); 40 creations from 40 addresses -> ${[...new Set(codes)].join(",")}. Abandoned-table cleanup is still open (U-N2).`);
  await S.stop();
}

section("idle / slow sockets");
{
  const S = await startServer();
  const idle = net.connect(S.port, "127.0.0.1"); let idleClosed = null; idle.on("close", () => (idleClosed = Date.now())); idle.on("error", () => {});
  const part = net.connect(S.port, "127.0.0.1"); let partClosed = null; part.on("close", () => (partClosed = Date.now())); part.on("error", () => {});
  part.write("GET / HTTP/1.1\r\nHost: x\r\nX-Slow: ");
  const T = await makeTable(S, ["Alice", "Bob"]);
  const mute = new Peer(S, "mute").ws(T.gameId); await mute.registered();
  mute.ws.pong = () => {}; // never answer protocol pings
  mute.ws._receiver.removeAllListeners("ping"); mute.ws._receiver.on("ping", () => {});
  const t0 = Date.now();
  await waitFor(() => partClosed || mute.closeCode !== null, { timeout: 80000, every: 500, what: "slow sockets" }).catch(() => {});
  await sleep(500);
  info("WS client that ignores protocol pings", mute.closeCode !== null ? `terminated after ${((Date.now() - t0) / 1000).toFixed(0)} s` : "still open after 80 s");
  info("raw TCP with no bytes (Node http has no idle timeout for it)", idleClosed ? "closed" : "still open after 80 s (Azure's front end terminates idle client TCP; Node only sees ARR connections)");
  info("half-sent HTTP header", partClosed ? `server closed it after ${((partClosed - t0) / 1000).toFixed(0)} s` : "still open after 80 s");
  idle.destroy(); part.destroy();
  await S.stop();
}
finish("s05-limits");
