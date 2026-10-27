// (2) cookie flags (also behind a simulated TLS proxy), cookie forgery/guessing, SESSION_SECRET handling and logging.
import { spawn } from "node:child_process";
import { Peer, WsConn, rawHttp, startServer, makeTable, newToken, playerIdFor, TEST_SECRET, mkTmp, ensureBundle, sleep, cleanup } from "./lib/harness.mjs";
import { ok, defect, info, section, finish } from "./lib/t.mjs";

const setCookies = (r) => r.cookies.filter((c) => c.startsWith("ptn="));
const flags = (c) => c.split(";").slice(1).map((s) => s.trim());
const has = (c, f) => flags(c).some((x) => x.toLowerCase() === f.toLowerCase());

/* ---------- plain dev server ---------- */
section("cookie flags: plain http (dev)");
const A = await startServer();
const paths = ["/", "/home", "/start-game", "/verify", "/poker-tutorial", "/current-player-infos"];
const t = await makeTable(A, ["Alice", "Bob"]);
paths.push(`/games/${t.gameId}`);
for (const p of paths) {
  const r = await rawHttp(A, { path: p });
  const c = setCookies(r)[0];
  ok(`cookie minted on GET ${p.replace(t.gameId, ":id")}`, !!c, `${r.status} ${c ? "" : "no ptn cookie"}`);
  if (!c) continue;
  ok(`  flags: HttpOnly; SameSite=Lax; Path=/; Max-Age; no Domain`, has(c, "HttpOnly") && has(c, "SameSite=Lax") && has(c, "Path=/") && flags(c).some((x) => /^Max-Age=\d+$/i.test(x)) && !flags(c).some((x) => /^Domain=/i.test(x)), c.replace(/ptn=[^;]{6}[^;]*/, "ptn=<token>"));
  ok(`  token is 50 URL-safe chars`, /^ptn=[A-Za-z0-9_-]{50};/.test(c), "");
  ok(`  no Secure flag over plain http in dev (so local play works)`, !has(c, "Secure"), "");
}
{
  const r = await rawHttp(A, { path: "/healthz" });
  ok("no cookie on /healthz", setCookies(r).length === 0, "");
  const a = await rawHttp(A, { path: "/assets/does-not-exist.js" });
  ok("no cookie on 404 static", setCookies(a).length === 0, "");
  const p = new Peer(A, "known");
  const k = await rawHttp(A, { path: "/", headers: { cookie: p.cookie } });
  ok("no new cookie when a well-formed ptn is presented", setCookies(k).length === 0, "");
  const bad = await rawHttp(A, { path: "/", headers: { cookie: "ptn=short" } });
  ok("malformed ptn is replaced by a fresh cookie", setCookies(bad).length === 1, "");
  const xf = await rawHttp(A, { path: "/", headers: { "x-forwarded-proto": "https" } });
  ok("X-Forwarded-Proto ignored without a trusted proxy (no Secure)", setCookies(xf).length === 1 && !has(setCookies(xf)[0], "Secure"), "");
}
{
  const r = await rawHttp(A, { method: "POST", path: "/new-game", headers: { origin: A.origin, "content-type": "application/json" }, body: JSON.stringify({ playerName: "Newbie" }) });
  const c = setCookies(r)[0];
  ok("POST /new-game without a cookie mints a hardened cookie", r.status === 200 && !!c && has(c, "HttpOnly") && has(c, "SameSite=Lax"), `${r.status}`);
}
await A.stop();

/* ---------- behind a (simulated) TLS-terminating proxy ---------- */
section("cookie flags: trusted proxy / TLS simulation");
const B = await startServer({ env: { TRUST_PROXY: "1" } });
{
  const https = await rawHttp(B, { path: "/", headers: { "x-forwarded-proto": "https", "x-forwarded-host": "poker.example.com" } });
  const c = setCookies(https)[0];
  ok("X-Forwarded-Proto: https => Secure; HttpOnly; SameSite=Lax", !!c && has(c, "Secure") && has(c, "HttpOnly") && has(c, "SameSite=Lax"), c ?? "none");
  const http1 = await rawHttp(B, { path: "/", headers: { "x-forwarded-proto": "http" } });
  ok("X-Forwarded-Proto: http => not Secure", setCookies(http1).length === 1 && !has(setCookies(http1)[0], "Secure"), "");
  const list = await rawHttp(B, { path: "/", headers: { "x-forwarded-proto": "https, http" } });
  ok("first X-Forwarded-Proto token decides", has(setCookies(list)[0], "Secure"), "");
  const t2 = await rawHttp(B, { method: "POST", path: "/new-game", headers: { origin: "https://poker.example.com", "x-forwarded-proto": "https", "x-forwarded-host": "poker.example.com", "content-type": "application/json" }, body: JSON.stringify({ playerName: "TlsGuy" }) });
  ok("POST /new-game behind TLS proxy: cookie Secure", t2.status === 200 && has(setCookies(t2)[0] ?? "", "Secure"), `${t2.status}`);
}
await B.stop();
const P = await startServer({ env: { NODE_ENV: "production" } });
{
  const r = await rawHttp(P, { path: "/" });
  ok("production: Secure is always set (even if the proxy header is missing)", has(setCookies(r)[0] ?? "", "Secure"), setCookies(r)[0] ?? "none");
  const xf = await rawHttp(P, { path: "/", headers: { "x-forwarded-proto": "http" } });
  ok("production (untrusted proxy header 'http'): still Secure", has(setCookies(xf)[0] ?? "", "Secure"), "");
}
await P.stop();

/* ---------- forgery / guessing ---------- */
section("forgery and guessing");
const F = await startServer();
const tf = await makeTable(F, ["Alice", "Bob"]);
{
  const alice = tf.owner, bob = tf.players[1];
  // ids are public, tokens are not: the id is a keyed hash of the token
  const info1 = (await alice.get("/current-player-infos")).json;
  ok("player id = base64url(HMAC-SHA256(SESSION_SECRET, token))[0..10]", info1.id === playerIdFor(TEST_SECRET, alice.token) && info1.id === alice.id, info1.id);
  ok("the id is not the token and not derivable without the secret", playerIdFor("dev-secret-not-for-production", alice.token) !== info1.id, "");
  // use Bob's PUBLIC id in every cookie shape an attacker could try
  const bobId = bob.id;
  const shapes = [bobId, bobId.padEnd(50, "A"), "A".repeat(40) + bobId, bobId.repeat(5), Buffer.from(bobId).toString("base64url").padEnd(50, "-")];
  for (const [i, tok] of shapes.entries()) {
    const r = await rawHttp(F, { path: "/current-player-infos", headers: { cookie: `ptn=${tok}` } });
    ok(`public id of Bob used as cookie value #${i} does not authenticate as Bob`, r.json.id !== bobId, "");
  }
  // owner endpoints with forged / malformed cookies
  for (const [label, cookie] of [["no cookie", ""], ["empty", "ptn="], ["49 chars", "ptn=" + newToken(49)], ["51 chars", "ptn=" + newToken(51)], ["bad alphabet", "ptn=" + "!".repeat(50)], ["sql-ish", "ptn=' OR '1'='1"], ["Bob's id", "ptn=" + bobId]]) {
    const r = await rawHttp(F, { method: "POST", path: `/games/${tf.gameId}/transfer_ownership`, headers: { origin: F.origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ playerID: bobId }) });
    ok(`owner endpoint with ${label} -> 403 and ownership unchanged`, r.status === 403 && tf.conns[0].frame.table.ownerId === alice.id, `${r.status} ${r.text.slice(0, 50)}`);
  }
  // duplicate ptn cookies: the FIRST one wins (record: cookie-tossing relies on the browser ordering)
  const two = await rawHttp(F, { path: "/current-player-infos", headers: { cookie: `ptn=${alice.token}; ptn=${bob.token}` } });
  info("duplicate ptn cookies", `identity = ${two.json.id === alice.id ? "first cookie" : two.json.id === bob.id ? "second cookie" : "other"} (Cookie header order is chosen by the browser)`);
  // alternative token channels (SPEC 1.4): header x-user-token and WS ?ut=
  const viaHeader = await rawHttp(F, { path: "/current-player-infos", headers: { "x-user-token": alice.token } });
  info("x-user-token header", `authenticates as ${viaHeader.json.id === alice.id ? "the token owner (works as documented)" : "someone else"}; custom headers cannot be set cross-site without CORS`);
  const viaQuery = await rawHttp(F, { path: `/games/${tf.gameId}/players_sessions?ut=${alice.token}` });
  ok("?ut= on HTTP routes does not authenticate", viaQuery.status === 403, `${viaQuery.status}`);
  const wsUt = new WsConn(F, new Peer(F, "x", { token: newToken() }), tf.gameId, { query: `layout=d&ut=${alice.token}`, noCookie: true });
  await wsUt.registered(3000).catch(() => {});
  info("WS ?ut= token in URL", `registered as ${wsUt.frame?.you?.id === alice.id ? "the token owner" : "other"}: the token travels in the URL (Azure access logs / history) when this fallback is used; check whether the client ever uses it`);
  wsUt.close();
  // brute force sample: random tokens never collide with a known id
  let hits = 0; const seen = new Set();
  for (let i = 0; i < 20000; i++) { const id = playerIdFor(TEST_SECRET, newToken()); if (id === bobId) hits++; seen.add(id); }
  ok("20k random tokens: no collision with a live id, all ids distinct", hits === 0 && seen.size === 20000, `distinct=${seen.size}`);
  // token never appears in anything the server sends to the others
  const blob = [...tf.conns[0].raw, ...tf.conns[1].raw].join("\n") + (await alice.get(`/games/${tf.gameId}/players_sessions`)).text + (await bob.get(`/api/games/${tf.gameId}/log_v3?hand_number=1`)).text;
  ok("no peer token or secret appears in any frame/body seen by the peers", ![alice.token, bob.token, TEST_SECRET].some((s) => blob.includes(s)), "");
}
await F.stop();

/* ---------- SESSION_SECRET handling ---------- */
section("SESSION_SECRET: required in production, never logged");
const bundle = await ensureBundle();
function run(env, ms = 4000) {
  return new Promise((res) => {
    const dir = mkTmp("secret-");
    const p = spawn(process.execPath, [bundle], { env: { PATH: process.env.PATH, PORT: "0", DATA_DIR: dir, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    const t = setTimeout(() => { p.kill("SIGKILL"); }, ms);
    let probe = null;
    p.on("exit", (code) => { clearTimeout(t); if (probe) clearInterval(probe); cleanup(dir); res({ code, out }); });
    probe = setInterval(() => { if (/listening on/.test(out)) { clearInterval(probe); probe = null; p.kill("SIGTERM"); } }, 50);
  });
}
{
  let r = await run({ NODE_ENV: "production" });
  ok("production without SESSION_SECRET refuses to start", r.code !== 0 && /SESSION_SECRET is required/.test(r.out) && !/listening on/.test(r.out), `exit=${r.code}`);
  r = await run({ NODE_ENV: "production", SESSION_SECRET: "" });
  ok("production with EMPTY SESSION_SECRET refuses to start", r.code !== 0 && !/listening on/.test(r.out), `exit=${r.code}`);
  const distinctive = "TopSecret-" + newToken(24);
  r = await run({ NODE_ENV: "production", SESSION_SECRET: distinctive });
  ok("production with a secret starts and does not print it", /listening on/.test(r.out) && !r.out.includes(distinctive), `exit=${r.code}`);
  r = await run({ NODE_ENV: "production", SESSION_SECRET: "a" });
  defect("c-prod-hardening.secret-min-length", "c-prod-hardening", !/listening on/.test(r.out), "a 1-character SESSION_SECRET is accepted in production (no minimum length)");
  // Azure-like environment where NODE_ENV was forgotten: WEBSITE_SITE_NAME is set by App Service itself
  r = await run({ WEBSITE_SITE_NAME: "pokerthen-yash" });
  defect("c-prod-hardening.azure-fail-open", "c-prod-hardening", !/listening on/.test(r.out), "WEBSITE_SITE_NAME set, NODE_ENV/SESSION_SECRET missing: the server starts with the public dev secret 'dev-secret-not-for-production' (fail-open)");
  r = await run({ WEBSITE_SITE_NAME: "pokerthen-yash", DEV_FIXED_DECKS: "/nonexistent.json" });
  defect("c-prod-hardening.azure-dev-decks", "c-prod-hardening", !/DEV_FIXED_DECKS active/.test(r.out) && !/ENOENT/.test(r.out), "WEBSITE_SITE_NAME set but NODE_ENV unset: DEV_FIXED_DECKS (scripted decks!) is honoured: " + (r.out.match(/\[dev\][^\n]*|ENOENT[^\n]*/) ?? [""])[0].slice(0, 120));
}
// the secret never shows up in logs even while the server is being abused
{
  const distinctive = "LogProbe-" + newToken(24);
  const L = await startServer({ secret: distinctive });
  const tl = await makeTable(L, ["Alice", "Bob"]);
  const evilCookie = "ptn=" + newToken();
  const reqs = [
    rawHttp(L, { method: "POST", path: `/games/${tl.gameId}/update_game`, headers: { origin: L.origin, cookie: tl.owner.cookie, "content-type": "application/json" }, body: "{" }),
    rawHttp(L, { method: "POST", path: `/games/${tl.gameId}/update_game`, headers: { origin: L.origin, cookie: tl.owner.cookie, "content-type": "application/json" }, body: "{}" }),
    rawHttp(L, { path: `/games/${tl.gameId}/players_sessions/%E0%A4%A`, headers: { cookie: tl.owner.cookie } }),
    rawHttp(L, { path: `/api/games/${tl.gameId}/log_v3?hand_number=abc`, headers: { cookie: tl.owner.cookie } }),
    rawHttp(L, { path: `/ws?gameID=${tl.gameId}&ut=${tl.owner.token}`, headers: { cookie: evilCookie } })
  ];
  await Promise.all(reqs);
  tl.conns[0].send("{not json"); tl.conns[0].send({ t: "action", action: { type: "PLAYER_RAISE", value: -1 } }); tl.conns[0].send({ t: "chat", text: "x".repeat(300) });
  await sleep(400);
  const logs = L.logs();
  ok("server stdout/stderr never contains the SESSION_SECRET", !logs.includes(distinctive), "");
  ok("server stdout/stderr never contains a player token", ![tl.owner.token, tl.players[1].token].some((x) => logs.includes(x)), "");
  info("log sample after abuse", logs.split("\n").filter(Boolean).slice(0, 8).map((l) => l.slice(0, 140)).join(" || "));
  await L.stop();
}
// identity survives a restart with the same secret and is orphaned by a different one
{
  const dir = mkTmp("rot-");
  const s1 = await startServer({ dataDir: dir, secret: "first-secret-" + newToken(10) });
  const p = new Peer(s1, "o", { token: newToken() }); p.id = (await p.get("/current-player-infos")).json.id;
  const gid = await p.newGame("Owner1");
  await s1.stop();
  const s2 = await startServer({ dataDir: dir, secret: s1.secret });
  const same = (await rawHttp(s2, { path: "/current-player-infos", headers: { cookie: p.cookie } })).json.id;
  const r1 = await rawHttp(s2, { method: "POST", path: `/games/${gid}/start-game`, headers: { origin: s2.origin, cookie: p.cookie, "content-type": "application/json" }, body: "{}" });
  ok("same secret after restart: same id, still the owner", same === p.id && r1.status !== 403, `${r1.status}`);
  await s2.stop();
  const s3 = await startServer({ dataDir: dir, secret: "rotated-secret-" + newToken(10) });
  const r2 = await rawHttp(s3, { method: "POST", path: `/games/${gid}/start-game`, headers: { origin: s3.origin, cookie: p.cookie, "content-type": "application/json" }, body: "{}" });
  info("SESSION_SECRET rotation", `after changing the secret the old cookie maps to a different id => owner/players are orphaned (start-game -> ${r2.status} ${r2.json?.code ?? ""}). Never rotate the Azure setting; no recovery path exists.`);
  await s3.stop(); cleanup(dir);
}
finish("s02-cookies");
