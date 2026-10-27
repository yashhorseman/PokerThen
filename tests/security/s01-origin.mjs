// (1) Origin checks on the WebSocket upgrade and on unsafe HTTP methods; X-Forwarded-* spoofing with and without a trusted proxy.
//   node tests/security/s01-origin.mjs        (PT_ROOT=<snapshot> to audit a frozen copy)
import { Peer, WsConn, rawHttp, rawTcp, startServer, makeTable, newToken, sleep } from "./lib/harness.mjs";
import { ok, defect, info, section, finish } from "./lib/t.mjs";

async function wsTry(S, peer, gameId, o = {}) {
  const w = new WsConn(S, peer, gameId, o);
  const out = await w.outcome(3000);
  if (w.opened) await w.registered(2000).catch(() => {});
  w.terminate();
  return out;
}
const bodyOf = (r) => r.json?.code ?? r.text.slice(0, 60);

/* ---------- server A: no trusted proxy (local / non-Azure) ---------- */
section("A. untrusted proxy: WebSocket upgrade");
const A = await startServer();
const t = await makeTable(A, ["Alice", "Bob"]);
const gid = t.gameId;
const guest = new Peer(A, "guest");
const o = A.origin;
const hostPort = `127.0.0.1:${A.port}`;
let r;
r = await wsTry(A, guest, gid); ok("ws.origin.matching", r.opened, JSON.stringify(r));
r = await wsTry(A, guest, gid, { noOrigin: true }); ok("ws.origin.missing -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: "https://evil.example" }); ok("ws.origin.evil -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: "null" }); ok("ws.origin.null -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: `http://127.0.0.1:${A.port + 1}` }); ok("ws.origin.other-port -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: `${o}.evil.example` }); ok("ws.origin.suffix-attack -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: `http://evil.example/${hostPort}` }); ok("ws.origin.path-trick -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: `https://${hostPort}` }); ok("ws.origin.https-on-http -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: "https://evil.example", headers: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } });
ok("ws.xfh-spoof ignored when proxy not trusted -> 403", !r.opened && r.status === 403, JSON.stringify(r));
r = await wsTry(A, guest, gid, { origin: "http://evil.example", headers: { host: "evil.example" } });
info("ws.host-header-reflection", `Origin==Host accepted? opened=${r.opened} status=${r.status} (Origin check is self-referential: Origin must equal http(s)://<Host header>)`);
r = await wsTry(A, guest, gid, { origin: o.toUpperCase().replace("HTTP", "http") });
info("ws.origin.case-insensitive", `opened=${r.opened} (browsers always send lowercase scheme/host)`);
// duplicate Origin headers on a hand-built upgrade
{
  const key = Buffer.from(newToken(16)).toString("base64");
  const req = (origins) => `GET /ws?gameID=${gid}&layout=d HTTP/1.1\r\nHost: ${hostPort}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${origins.map((x) => `Origin: ${x}\r\n`).join("")}Cookie: ${guest.cookie}\r\n\r\n`;
  const a = await rawTcp(A, req(["https://evil.example", o]), { timeout: 1500, readUntilClose: false });
  const b = await rawTcp(A, req([o, "https://evil.example"]), { timeout: 1500, readUntilClose: false });
  const c = await rawTcp(A, req([`${o}, https://evil.example`]), { timeout: 1500, readUntilClose: false });
  const d = await rawTcp(A, req([`https://evil.example, ${o}`]), { timeout: 1500, readUntilClose: false });
  info("ws.origin.duplicate-headers", `[evil,ok]=${a.text.split("\r\n")[0]} | [ok,evil]=${b.text.split("\r\n")[0]} | "ok, evil"=${c.text.split("\r\n")[0]} | "evil, ok"=${d.text.split("\r\n")[0]}`);
  ok("ws.origin.dup-evil-first/last are never accepted when evil is the first value", !/101/.test(a.text.split("\r\n")[0]) && !/101/.test(d.text.split("\r\n")[0]), `${a.text.split("\r\n")[0]} / ${d.text.split("\r\n")[0]}`);
}
// cookie + unknown game
r = await wsTry(A, guest, "ptlDoesNotExist00000000", {}); ok("ws.unknown-game closes 4404 after upgrade (no table info leaked)", r.opened ? true : false, JSON.stringify(r));
{
  const w = new WsConn(A, guest, "ptlDoesNotExist00000000"); await w.outcome(2000); await w.closed; ok("ws.unknown-game close code 4404", w.closeCode === 4404, `code=${w.closeCode}`);
  const w2 = new WsConn(A, guest, gid, { noCookie: true }); await w2.outcome(2000); await w2.closed; ok("ws.no-cookie close code 4401", w2.closeCode === 4401, `code=${w2.closeCode}`);
}

section("A. untrusted proxy: unsafe HTTP methods");
const target = `/games/${gid}/start-game`; // owner-only; with a bad origin we must get bad-origin BEFORE anything else happens
const alice = t.owner;
const post = (headers, body = "{}") => rawHttp(A, { method: "POST", path: target, headers: { cookie: alice.cookie, "content-type": "application/json", ...headers }, body });
r = await post({ origin: o }); ok("http.origin.matching passes the origin gate", r.status !== 403 || bodyOf(r) !== "bad-origin", `${r.status} ${bodyOf(r)}`);
r = await post({}); ok("http.origin.missing (no Sec-Fetch-Site) -> 403 bad-origin", r.status === 403 && bodyOf(r) === "bad-origin", `${r.status} ${bodyOf(r)}`);
r = await post({ origin: "https://evil.example" }); ok("http.origin.evil -> 403 bad-origin", r.status === 403 && bodyOf(r) === "bad-origin", `${r.status} ${bodyOf(r)}`);
r = await post({ origin: "null" }); ok("http.origin.null -> 403 bad-origin", r.status === 403 && bodyOf(r) === "bad-origin", `${r.status} ${bodyOf(r)}`);
r = await post({ "sec-fetch-site": "cross-site" }); ok("http.no-origin + Sec-Fetch-Site cross-site -> 403", r.status === 403, `${r.status} ${bodyOf(r)}`);
r = await post({ "sec-fetch-site": "same-site" }); ok("http.no-origin + Sec-Fetch-Site same-site -> 403", r.status === 403, `${r.status} ${bodyOf(r)}`);
r = await post({ "sec-fetch-site": "none" }); ok("http.no-origin + Sec-Fetch-Site none -> 403", r.status === 403, `${r.status} ${bodyOf(r)}`);
r = await post({ "sec-fetch-site": "same-origin" }); info("http.no-origin + Sec-Fetch-Site same-origin", `passes the gate: ${r.status} ${bodyOf(r)} (browsers always send Origin on POST; non-browsers can forge both)`);
r = await post({ origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
ok("http.xfh-spoof ignored when proxy not trusted -> 403", r.status === 403 && bodyOf(r) === "bad-origin", `${r.status} ${bodyOf(r)}`);
r = await post({ origin: "https://evil.example", "content-type": "text/plain" }, JSON.stringify({}));
ok("http.cross-site text/plain form POST -> 403", r.status === 403, `${r.status}`);
r = await rawHttp(A, { method: "POST", path: target, headers: { origin: "https://evil.example" }, body: "{}" }); // no cookie at all (what a SameSite=Lax browser sends cross-site)
ok("http.cross-site POST without cookie -> 403 bad-origin (origin gate runs before identity)", r.status === 403 && bodyOf(r) === "bad-origin", `${r.status} ${bodyOf(r)}`);
for (const m of ["PUT", "DELETE", "PATCH"]) { r = await rawHttp(A, { method: m, path: target, headers: { origin: "https://evil.example", cookie: alice.cookie } }); ok(`http.method ${m} -> 405`, r.status === 405, `${r.status}`); }
r = await rawHttp(A, { method: "OPTIONS", path: target, headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
ok("http.OPTIONS preflight gets no CORS grant", !r.headers["access-control-allow-origin"], `${r.status} acao=${r.headers["access-control-allow-origin"]}`);
r = await rawHttp(A, { method: "GET", path: `/games/${gid}`, headers: { origin: "https://evil.example", cookie: alice.cookie } });
ok("http.GET responses carry no Access-Control-Allow-Origin", !r.headers["access-control-allow-origin"], `${r.status}`);
r = await rawHttp(A, { method: "GET", path: target, headers: { "x-http-method-override": "POST", cookie: alice.cookie, origin: "https://evil.example" } });
ok("http.GET + X-HTTP-Method-Override does not reach POST handlers", r.status !== 200 && r.status !== 422, `${r.status}`);
// the new-game endpoint is also an unsafe method
r = await rawHttp(A, { method: "POST", path: "/new-game", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ playerName: "Evil" }) });
ok("http./new-game cross-origin -> 403", r.status === 403, `${r.status}`);
const tablesBefore = (await rawHttp(A, { path: "/healthz" })).json.tables;
r = await rawHttp(A, { method: "POST", path: "/new-game", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerName: "Evil" }) });
ok("http./new-game without Origin -> 403 and no table created", r.status === 403 && (await rawHttp(A, { path: "/healthz" })).json.tables === tablesBefore, `${r.status}`);

section("A. ALLOWED_ORIGINS / DEV_ORIGINS");
await A.stop();
const A2 = await startServer({ env: { ALLOWED_ORIGINS: "https://app.example.org/, https://alt.example.org", DEV_ORIGINS: "http://dev.example.org" } });
{
  const t2 = await makeTable(A2, ["Alice", "Bob"]);
  const g = new Peer(A2, "g");
  let x = await wsTry(A2, g, t2.gameId, { origin: "https://app.example.org" }); ok("allowed origin (trailing slash in env) accepted", x.opened, JSON.stringify(x));
  x = await wsTry(A2, g, t2.gameId, { origin: "https://alt.example.org" }); ok("second allowed origin accepted", x.opened, JSON.stringify(x));
  x = await wsTry(A2, g, t2.gameId, { origin: "http://dev.example.org" }); ok("DEV_ORIGINS accepted outside production", x.opened, JSON.stringify(x));
  x = await wsTry(A2, g, t2.gameId, { origin: "https://app.example.org.evil.example" }); ok("allow-list is exact-match", !x.opened && x.status === 403, JSON.stringify(x));
}
await A2.stop();
const P = await startServer({ env: { NODE_ENV: "production", ALLOWED_ORIGINS: "https://app.example.org", DEV_ORIGINS: "http://dev.example.org" } });
{
  const t3 = await makeTable(P, ["Alice", "Bob"]);
  const g = new Peer(P, "g");
  const x = await wsTry(P, g, t3.gameId, { origin: "http://dev.example.org" }); ok("DEV_ORIGINS ignored in production", !x.opened && x.status === 403, JSON.stringify(x));
}
await P.stop();

/* ---------- server B: trusted proxy (Azure App Service / TRUST_PROXY=1) ---------- */
section("B. trusted proxy (TRUST_PROXY=1): X-Forwarded-Host/Proto drive the expected origin");
const B = await startServer({ env: { TRUST_PROXY: "1" } });
{
  const tb = await makeTable(B, ["Alice", "Bob"], { ip: () => "198.51.100.7" });
  const g = new Peer(B, "g", { ip: "198.51.100.8" });
  const fwd = { "x-forwarded-host": "poker.example.com", "x-forwarded-proto": "https" };
  let x = await wsTry(B, g, tb.gameId, { origin: "https://poker.example.com", headers: fwd }); ok("proxy: Origin == https://X-Forwarded-Host accepted", x.opened, JSON.stringify(x));
  x = await wsTry(B, g, tb.gameId, { origin: "http://poker.example.com", headers: fwd }); ok("proxy: scheme mismatch rejected", !x.opened && x.status === 403, JSON.stringify(x));
  x = await wsTry(B, g, tb.gameId, { origin: "https://evil.example", headers: fwd }); ok("proxy: foreign Origin rejected", !x.opened && x.status === 403, JSON.stringify(x));
  x = await wsTry(B, g, tb.gameId, { origin: "https://poker.example.com", headers: { ...fwd, "x-forwarded-proto": "https, http" } }); ok("proxy: first X-Forwarded-Proto token wins", x.opened, JSON.stringify(x));
  x = await wsTry(B, g, tb.gameId, { origin: "https://poker.example.com", headers: { "x-forwarded-host": "poker.example.com, internal.local", "x-forwarded-proto": "https" } }); ok("proxy: first X-Forwarded-Host token wins", x.opened, JSON.stringify(x));
  const hp = await rawHttp(B, { method: "POST", path: `/games/${tb.gameId}/start-game`, headers: { cookie: tb.owner.cookie, origin: "https://poker.example.com", ...fwd, "content-type": "application/json" }, body: "{}" });
  ok("proxy: POST with matching forwarded origin passes the gate", !(hp.status === 403 && bodyOf(hp) === "bad-origin"), `${hp.status} ${bodyOf(hp)}`);
  const hq = await rawHttp(B, { method: "POST", path: `/games/${tb.gameId}/start-game`, headers: { cookie: tb.owner.cookie, origin: "https://evil.example", ...fwd, "content-type": "application/json" }, body: "{}" });
  ok("proxy: POST with foreign origin rejected", hq.status === 403 && bodyOf(hq) === "bad-origin", `${hq.status} ${bodyOf(hq)}`);
  info("proxy.trust-model", "With TRUST_PROXY=1/Azure the expected origin is taken from request headers; this is only safe because browsers cannot set X-Forwarded-*, and only if the front end overwrites client-supplied values (verify on Azure: send X-Forwarded-Host through the real front end).");
}
await B.stop();
finish("s01-origin");
