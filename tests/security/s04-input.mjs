// (4) input validation: oversize bodies / WS messages, malformed JSON, prototype-pollution keys, negative/NaN/huge numbers,
//     chat limits, nickname edge cases. The server must stay up, answer 4xx (never 5xx), keep chips conserved and show no pollution.
import { Peer, WsConn, rawHttp, rawTcp, startServer, makeTable, newToken, sleep } from "./lib/harness.mjs";
import { ok, defect, info, section, finish, waitFor } from "./lib/t.mjs";

const S = await startServer({ rotateIp: true }); // every request gets its own X-Forwarded-For so this file tests validation, not the rate limiter (see s05)
const T = await makeTable(S, ["Alice", "Bob", "Cara"]);
const gid = T.gameId;
const [alice, bob, cara] = T.players;
const A = T.conns[0];
const cfg = (await alice.get(`/games/${gid}/current_or_next_configs`)).json; delete cfg.queued;
const alive = async () => (await rawHttp(S, { path: "/healthz" })).status === 200;
const post = (p, body, who = alice, extra = {}) => who.post(p, body, extra);
const h = (r) => `${r.status} ${r.text.slice(0, 70)}`;

section("HTTP body size limit (16 KB)");
{
  const mk = (n) => JSON.stringify({ playerName: "x".repeat(Math.max(0, n - 20)) }) ;
  const pad = (target) => { const base = JSON.stringify({ playerName: "ab", pad: "" }); return JSON.stringify({ playerName: "ab", pad: "p".repeat(target - base.length) }); };
  let b = pad(16384); ok("body of exactly 16384 bytes reaches the handler", Buffer.byteLength(b) === 16384, "");
  let r = await post("/new-game", b, new Peer(S, "p1")); ok("16384-byte body is processed (not 413)", r.status !== 413, h(r));
  b = pad(16385); r = await post("/new-game", b, new Peer(S, "p2").constructor === Peer ? new Peer(S, "p2") : alice).catch((e) => ({ status: -1, text: String(e.message) }));
  ok("16385-byte body -> 413 (or the connection is cut), never processed", r.status === 413 || r.status === -1, h(r));
  info("oversize body client view", r.status === -1 ? "client sees a reset/closed connection instead of a 413 (request stream destroyed by the size guard)" : "413 delivered");
  const big = "{\"a\":\"" + "z".repeat(5_000_000) + "\"}";
  r = await post(`/games/${gid}/update_game`, big).catch((e) => ({ status: -1, text: String(e.message) }));
  ok("5 MB body to update_game is refused quickly and the server survives", (r.status === 413 || r.status === -1) && (await alive()), h(r));
  // chunked without content-length
  const chunked = await rawTcp(S, [`POST /new-game HTTP/1.1\r\nHost: 127.0.0.1:${S.port}\r\nX-Forwarded-For: 10.9.9.9\r\nOrigin: ${S.origin}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, `${(20000).toString(16)}\r\n${"a".repeat(20000)}\r\n0\r\n\r\n`], { timeout: 2500 });
  ok("chunked 20 KB body is refused (413 / closed), not processed", /413|400/.test(chunked.text.split("\r\n")[0]) || chunked.text === "", chunked.text.split("\r\n")[0] || "(closed, no response)");
  const hdr = await rawHttp(S, { path: "/", headers: { "x-big": "h".repeat(20000) } }).catch((e) => ({ status: -1, text: String(e.message) }));
  ok("oversize request headers (20 KB) are refused by the HTTP parser (431 / reset)", hdr.status === 431 || hdr.status === -1, `${hdr.status}`);
  const url = await rawHttp(S, { path: "/" + "a".repeat(20000) }).catch((e) => ({ status: -1, text: String(e.message) }));
  ok("20 KB URL is refused (414/431/404/reset), never a 500", [414, 431, 404, -1].includes(url.status), `${url.status}`);
  ok("server alive", await alive(), "");
}

section("malformed / hostile JSON bodies");
{
  const bodies = ["{", "[1,2", "nul", '"str"', "123", "[]", "null", "", "﻿{}", '{"a":1}{"b":2}', '{"playerID":"' + "A".repeat(10) + '","playerID":"BBBBBBBBBB"}', "{".repeat(8000) + "}".repeat(8000), "[".repeat(8000) + "]".repeat(8000), '{"x":1e999}', '{"playerID":null}', '{"playerID":["a"]}', '{"playerID":{"a":1}}', '{"playerID":"' + "\u0000".repeat(10) + '"}'];
  const eps = ["approve_player", "reject_player", "remove_player", "transfer_ownership", "put_in_away_mode", "toggle_god_mode", "update_player", "update_game", "start-game", "request_rebuy", "resolve_rebuy", "request_ingress"];
  const codes = new Map();
  let fivexx = 0;
  for (const body of bodies) for (const ep of eps) {
    const r = await rawHttp(S, { method: "POST", path: `/games/${gid}/${ep}`, headers: { origin: S.origin, cookie: alice.cookie, "content-type": "application/json" }, body });
    codes.set(r.status, (codes.get(r.status) ?? 0) + 1);
    if (r.status >= 500) { fivexx++; if (fivexx <= 6) info("5xx", `${ep} body=${body.slice(0, 40).replace(/\n/g, " ")} -> ${r.status} ${r.text.slice(0, 60)}`); }
  }
  info("status histogram over bodies x endpoints", JSON.stringify([...codes]));
  defect("c-config-validation.no-5xx-on-bad-bodies", "c-config-validation", fivexx === 0, `${fivexx} of ${bodies.length * eps.length} hostile bodies produced HTTP 5xx (engine threw; should be a 4xx)`);
  ok("server alive after the barrage", await alive(), "");
  const r = await rawHttp(S, { method: "POST", path: `/games/${gid}/update_game`, headers: { origin: S.origin, cookie: alice.cookie, "content-type": "application/json" }, body: "{" });
  ok("malformed JSON -> 400 bad-json", r.status === 400 && r.json?.code === "bad-json", h(r));
}

section("prototype-pollution keys (HTTP, WS, nested config)");
{
  const evil = [
    '{"__proto__":{"polluted":"yes"},"playerID":"AAAAAAAAAA"}',
    '{"constructor":{"prototype":{"polluted":"yes"}},"playerID":"AAAAAAAAAA"}',
    '{"playerID":"__proto__","allow":true}',
    '{"playerID":"constructor","allow":true}',
    JSON.stringify({ ...cfg, __proto__: { polluted: "yes" } }).replace('"blindLevels"', '"__proto__":{"polluted":"yes"},"blindLevels"'),
    JSON.stringify({ ...cfg, blindLevels: [{ sb: 10, bb: 20, ante: null, durationMin: null, __proto__: { polluted: 1 } }] }).replace('"sb"', '"__proto__":{"polluted":1},"sb"'),
    JSON.stringify({ ...cfg, constructor: { prototype: { polluted: "yes" } } })
  ];
  for (const ep of ["approve_player", "reject_player", "remove_player", "transfer_ownership", "put_in_away_mode", "toggle_god_mode", "update_player", "update_game", "request_ingress", "resolve_rebuy", "request_rebuy"]) {
    for (const body of evil) await rawHttp(S, { method: "POST", path: `/games/${gid}/${ep}`, headers: { origin: S.origin, cookie: alice.cookie, "content-type": "application/json" }, body });
  }
  for (const body of evil) await rawHttp(S, { method: "POST", path: "/new-game", headers: { origin: S.origin, cookie: alice.cookie, "content-type": "application/json" }, body: body.replace("playerID", "playerName") });
  const wsEvil = [
    '{"t":"action","action":{"type":"PLAYER_FOLD","__proto__":{"polluted":"yes"}},"__proto__":{"polluted":"yes"}}',
    '{"t":"action","action":{"type":"TOGGLE_MUTE_PLAYER","otherPlayerID":"__proto__"}}',
    '{"t":"action","action":{"type":"TOGGLE_MUTE_PLAYER","otherPlayerID":"constructor"}}',
    '{"t":"chat","text":"hi","__proto__":{"polluted":"yes"}}',
    '{"t":"__proto__","constructor":{"prototype":{"polluted":"yes"}}}',
    '{"t":"action","action":{"type":"ME","emoji":"__proto__"}}',
    '{"t":"ping","ts":1,"__proto__":{"polluted":"yes"}}'
  ];
  for (const m of wsEvil) for (const c of T.conns) c.send(m);
  await sleep(700);
  const pol = S.pollution();
  ok("no built-in prototype changed inside the real server process", pol === "", pol.trim());
  ok("a `__proto__` / `constructor` player id is not found (400/403/404/422, never 200)", (await post(`/games/${gid}/transfer_ownership`, { playerID: "__proto__" })).status !== 200, "");
  ok("sockets survived the hostile WS messages", T.conns.every((c) => c.ws.readyState === 1), "");
  ok("server alive", await alive(), "");
}

section("numbers: negative / fractional / NaN-like / huge");
{
  const nums = [-1, 0, 1, 1.5, 1e9, 1e21, 1e300, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 2, -0, "5", null, true, [], {}, "1e3", "Infinity", "NaN"];
  const raw = (n) => (typeof n === "number" ? (Object.is(n, -0) ? "-0" : String(n)) : JSON.stringify(n));
  const chips = () => Object.values(A.frame.players).reduce((a, p) => a + (p.stack ?? 0), 0);
  const total0 = chips();
  const results = [];
  for (const n of nums) {
    for (const [ep, mk] of [
      ["update_player", (v) => `{"playerID":"${bob.id}","stackChange":${v},"stackChangeMode":"ADD"}`],
      ["update_player", (v) => `{"playerID":"${bob.id}","stackChange":${v},"stackChangeMode":"SET"}`],
      ["update_player", (v) => `{"playerID":"${bob.id}","stackChange":${v},"stackChangeMode":"REMOVE"}`],
      ["approve_player", (v) => `{"playerID":"${bob.id}","stack":${v}}`],
      ["request_rebuy", (v) => `{"value":${v}}`],
      ["resolve_rebuy", (v) => `{"playerID":"${bob.id}","approve":true,"stack":${v}}`]
    ]) {
      const r = await rawHttp(S, { method: "POST", path: `/games/${gid}/${ep}`, headers: { origin: S.origin, cookie: ep === "request_rebuy" ? bob.cookie : alice.cookie, "content-type": "application/json" }, body: mk(raw(n)) });
      results.push([ep, raw(n), r.status]);
    }
  }
  ok("no 5xx for any numeric edge value on stack endpoints", results.every(([, , s]) => s < 500), results.filter(([, , s]) => s >= 500).map((x) => x.join(":")).join(" "));
  const accepted = results.filter(([, , s]) => s === 200).map(([e, v]) => `${e}(${v})`);
  info("numeric values ACCEPTED (200) by stack endpoints (pre-hand, owner only)", accepted.join(", ").slice(0, 400));
  await sleep(150);
  ok("every stack is a finite integer in [0, 1e10] after the barrage", Object.values(A.frame.players).every((p) => Number.isInteger(p.stack) && p.stack >= 0 && p.stack <= 1e10), JSON.stringify(Object.values(A.frame.players).map((p) => p.stack)));
  // request_ingress numerics (guest side): stack and seat
  const guest = new Peer(S, "g"); const gw = guest.ws(gid); await gw.registered();
  const ing = [];
  for (const [seat, stack] of [[0, 100], [11, 100], [1.5, 100], [-1, 100], ["3", 100], [5, -5], [5, 0], [5, 1.5], [5, 1e9], [5, 1e300], [5, "100"], [5, null], [5, 1000001], [5, 1000000]]) {
    const g2 = new Peer(S, "g2"); const w2 = g2.ws(gid); await w2.registered();
    const r = await rawHttp(S, { method: "POST", path: `/games/${gid}/request_ingress`, headers: { origin: S.origin, cookie: g2.cookie, "content-type": "application/json" }, body: `{"seat":${JSON.stringify(seat)},"playerName":"Gx${ing.length}","allowSpectator":false,"stack":${JSON.stringify(stack)}}` });
    ing.push([seat, stack, r.status]); w2.close();
  }
  ok("request_ingress: only seat 1..10 integer and stack 1..1,000,000 integer are accepted", ing.every(([seat, stack, s]) => (s === 200) === (Number.isInteger(seat) && seat >= 1 && seat <= 10 && Number.isInteger(stack) && stack >= 1 && stack <= 1000000)), ing.map((x) => x.join(":")).join(" "));
  gw.close();
}

section("update_game: schema is enforced? (owner only, but the config is broadcast to everybody)");
{
  const tryCfg = async (label, patch, expectReject) => {
    const r = await post(`/games/${gid}/update_game`, typeof patch === "function" ? patch(cfg) : { ...cfg, ...patch });
    ok(`update_game ${label} -> ${expectReject ? "rejected (4xx)" : "accepted"}`, expectReject ? r.status >= 400 && r.status < 500 : r.status === 200, h(r));
    return r;
  };
  await tryCfg("valid config", {}, false);
  await tryCfg("blind 0", { blindLevels: [{ sb: 0, bb: 20, ante: null, durationMin: null }] }, true);
  await tryCfg("blind 1e21", { blindLevels: [{ sb: 10, bb: 1e21, ante: null, durationMin: null }] }, true);
  await tryCfg("blind '10' (string)", { blindLevels: [{ sb: "10", bb: 20, ante: null, durationMin: null }] }, true);
  await tryCfg("101 blind levels", { blindLevels: Array.from({ length: 101 }, () => ({ sb: 10, bb: 20, ante: null, durationMin: 5 })) }, true);
  await tryCfg("runItTwice garbage", { runItTwice: "maybe" }, true);
  await tryCfg("decisionLimit 0", { decisionLimitSec: 0 }, true);
  await tryCfg("decisionLimit 1e9", { decisionLimitSec: 1e9 }, true);
  const fields = ["antes", "centsMode", "rabbitHunt", "straddleAllowed", "autoDeal", "dealToAway", "revealAllWhenNoAction", "spectatorMode", "allowRebuy", "guestChat", "recordChat", "autoTrimBets"];
  const notBool = [];
  for (const f of fields) { const r = await post(`/games/${gid}/update_game`, { ...cfg, [f]: "yes please" }); if (r.status === 200) notBool.push(f); await post(`/games/${gid}/update_game`, cfg); }
  defect("c-config-validation.boolean-fields", "c-config-validation", notBool.length === 0, `non-boolean values accepted and stored for: ${notBool.join(", ")}`);
  const r1 = await post(`/games/${gid}/update_game`, { ...cfg, evil: "<img src=x onerror=alert(1)>", nested: { a: { b: 1 } } });
  const echoed = JSON.stringify(A.frame.table.config).includes("onerror") || JSON.stringify((await alice.get(`/games/${gid}/current_or_next_configs`)).json).includes("onerror");
  defect("c-config-validation.unknown-fields", "c-config-validation", !(r1.status === 200 && echoed), "unknown config keys are accepted, persisted in state.json and broadcast to every viewer in every frame");
  const deep = '{"blindLevels":[{"sb":10,"bb":20,"ante":null,"durationMin":null}],"variant":"th","runItTwice":"no","showdownTime":"normal","decisionLimitSec":20,"timeBankSec":10,"timeBankFillHands":10,"junk":' + "[".repeat(6000) + "]".repeat(6000) + "}";
  const rd = await rawHttp(S, { method: "POST", path: `/games/${gid}/update_game`, headers: { origin: S.origin, cookie: alice.cookie, "content-type": "application/json" }, body: deep });
  const probeCmd = await post(`/games/${gid}/update_game`, cfg);
  defect("c-config-validation.deep-nesting-bricks-table", "c-config-validation", probeCmd.status === 200, `after a 6000-deep junk field (${rd.status}) the next update_game returns ${probeCmd.status} ${probeCmd.text.slice(0, 60)}`);
  await post(`/games/${gid}/update_game`, cfg);
  ok("server alive", await alive(), "");
}

section("WebSocket message limits and garbage");
{
  const w = new Peer(S, "wsfuzz"); const c = w.ws(gid); await c.registered();
  const pingOk = async (conn) => { const n = conn.msgs.length; conn.send({ t: "ping", ts: 42 }); return conn.until(() => conn.msgs.slice(n).find((m) => m.t === "pong"), 2000, "pong").then(() => true, () => false); };
  ok("baseline ping/pong", await pingOk(c), "");
  c.send("{not json"); c.send("null"); c.send("[]"); c.send('"x"'); c.send("123"); c.send('{"t":"nope"}'); c.send('{"t":"action"}'); c.send('{"t":"action","action":{"type":"NOPE"}}'); c.send('{"t":"action","action":{"type":"PLAYER_RAISE","value":"5"}}');
  c.send('{"t":"chat","text":123}'); c.send('{"t":"ping","ts":"x"}'); c.send("[".repeat(2000) + "]".repeat(2000));
  c.sendRaw(Buffer.from([1, 2, 3, 4])); // binary frame
  await sleep(300);
  ok("garbage / binary / deeply nested messages are ignored and the socket stays open", c.ws.readyState === 1 && (await pingOk(c)), "");
  const mk = (n) => JSON.stringify({ t: "chat", text: "a", pad: "p".repeat(Math.max(0, n - JSON.stringify({ t: "chat", text: "a", pad: "" }).length)) });
  const m4096 = mk(4096), m4097 = mk(4097);
  ok("test messages have the intended sizes", Buffer.byteLength(m4096) === 4096 && Buffer.byteLength(m4097) === 4097, `${Buffer.byteLength(m4096)}/${Buffer.byteLength(m4097)}`);
  c.send(m4096); await sleep(150);
  ok("4096-byte WS message is accepted (socket stays open)", c.ws.readyState === 1, "");
  c.send(m4097); await c.closed;
  ok("4097-byte WS message closes the socket with 1009 (message too big)", c.closeCode === 1009, `close=${c.closeCode}`);
  const c2 = new Peer(S, "wsbig").ws(gid); await c2.registered(); c2.sendRaw("x".repeat(1_000_000)); await c2.closed;
  ok("1 MB WS message closes with 1009 without the server buffering it", c2.closeCode === 1009 && (await alive()), `close=${c2.closeCode}`);
}

section("chat: 100-char limit, control characters, HTML");
{
  const A2 = T.conns[0], B2 = T.conns[1];
  const seen = () => B2.msgs.filter((m) => m.t === "chat").map((m) => m.message.message);
  const send = async (txt) => { const n = seen().length; A2.chat(txt); await sleep(950); return seen().slice(n); };
  let r = await send("a".repeat(100)); ok("100 chars accepted", r.length === 1 && r[0].length === 100, `${r.length}`);
  r = await send("a".repeat(101)); ok("101 chars dropped (not truncated, not broadcast)", r.length === 0, `${r.length}`);
  r = await send("😀".repeat(100)); ok("100 emoji (200 UTF-16 units) accepted: limit counts code points", r.length === 1, `${r.length}`);
  r = await send("😀".repeat(101)); ok("101 emoji dropped", r.length === 0, `${r.length}`);
  r = await send("a".repeat(401)); ok("401 UTF-16 units rejected by the schema", r.length === 0, "");
  r = await send("   "); ok("whitespace-only dropped", r.length === 0, "");
  r = await send("line1\nline2\u0007bell\u0000nul"); ok("control characters are replaced by spaces", r.length === 1 && !/[\u0000-\u001f]/.test(r[0]), JSON.stringify(r));
  r = await send("<img src=x onerror=alert(1)><script>alert(1)</script>"); ok("HTML is relayed verbatim as TEXT (escaping is the client's job; checked in s04b)", r.length === 1 && r[0].includes("<img"), JSON.stringify(r));
  const w = new Peer(S, "stranger"); const sc = new WsConn(S, w, gid, { noCookie: true }); await sc.closed;
  const w2 = new Peer(S, "watcher"); const wc = w2.ws(gid); await wc.registered();
  const n0 = seen().length; wc.chat("hello from a watcher"); await sleep(150);
  info("watchers may chat while guestChat is on (PokerNow parity)", `${seen().length - n0} message(s) delivered, labelled '${B2.msgs.filter((m) => m.t === "chat").slice(-1)[0]?.message.playerName}'`);
  const ugc = await post(`/games/${gid}/update_game`, { ...cfg, guestChat: false }); await sleep(100);
  info("guestChat=false update", h(ugc));
  const n1 = seen().length; wc.chat("muted guest"); bob.id; T.conns[1].chat("seated player still chats?"); await sleep(150);
  ok("guestChat=false: watcher chat is dropped (only checked while the change is applied, not queued behind a running hand)", ugc.json?.queued === true || !seen().slice(n1).some((x) => x === "muted guest"), "");
  await post(`/games/${gid}/update_game`, cfg);
  wc.close();
}

section("nicknames");
{
  const owner2 = new Peer(S, "nick-owner"); const g2 = await owner2.newGame("Zed"); const ow = owner2.ws(g2); await ow.registered();
  const results = [];
  const tryName = async (name, label = JSON.stringify(name)) => {
    const p = new Peer(S, "n"); const w = p.ws(g2); await w.registered();
    const r = await p.post(`/games/${g2}/request_ingress`, { seat: 5, playerName: name, allowSpectator: false, stack: 100 });
    await sleep(60);
    const shown = ow.frame.players[p.id]?.name;
    results.push({ label, status: r.status, body: r.text.slice(0, 60), shown });
    if (r.status === 200) { const ap = await owner2.post(`/games/${g2}/approve_player`, { playerID: p.id }); if (ap.status === 200) { const sp = ow.frame.seats.find(([, id]) => id === p.id); if (sp) await owner2.post(`/games/${g2}/remove_player`, { playerID: p.id }); } }
    w.close();
    return r;
  };
  for (const n of ["", "a", "ab", "a".repeat(14), "a".repeat(15), "   ", " ab ", "a  b", "a b", "ab​", "​​", "a\nb", "\tab", "ab\u0000", "ab‮ba", "😀😀", "😀".repeat(7), "😀".repeat(8), "<b>x</b>", "<script>", "&lt;b&gt;", "a\"b", "a @ b", "__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "Guest", "guest", "GUEST"]) await tryName(n);
  console.log("   name results:\n" + results.map((r) => `     ${r.label.padEnd(24)} -> ${r.status} shown=${JSON.stringify(r.shown)} ${r.status === 200 ? "" : r.body}`).join("\n"));
  const by = (l) => results.find((r) => r.label === JSON.stringify(l));
  ok("length rules: 2..14 accepted, 0/1/15 rejected (422)", by("ab").status === 200 && by("a".repeat(14)).status === 200 && [by(""), by("a"), by("a".repeat(15))].every((r) => r.status === 422), "");
  ok("whitespace-only rejected; padded duplicate of 'ab' is trimmed then rejected as taken", by("   ").status === 422 && by(" ab ").status === 422, "");
  ok("no 5xx for any nickname", results.every((r) => r.status < 500), "");
  const ctrl = results.filter((r) => /[\u0000-\u001f​‮]/.test(r.shown ?? "") && r.status === 200).map((r) => r.label);
  defect("c-input-hardening.nickname-control-chars", "c-input-hardening", ctrl.length === 0, `nicknames with control / zero-width / bidi-override characters are accepted and shown verbatim: ${ctrl.join(" ")} (invisible names, spoofed log lines via newline, name impersonation)`);
  const emoji = [by("😀😀"), by("😀".repeat(7)), by("😀".repeat(8))].map((r) => r.status);
  info("emoji names (request_ingress counts UTF-16 units, /new-game counts code points)", `2 emoji -> ${emoji[0]}, 7 emoji -> ${emoji[1]}, 8 emoji -> ${emoji[2]}`);
  // uniqueness
  const p1 = new Peer(S, "u1"); const w1 = p1.ws(g2); await w1.registered(); await p1.ingress(g2, 6, "Unique", 100); await owner2.post(`/games/${g2}/approve_player`, { playerID: p1.id });
  const variants = ["unique", "UNIQUE", " Unique ", "Unique​", "Unique ", "Uníque"];
  const vr = [];
  for (const v of variants) { const p = new Peer(S, "v"); const w = p.ws(g2); await w.registered(); const r = await p.ingress(g2, 7, v, 100); vr.push([v, r.status]); w.close(); }
  ok("case / padding variants of a taken name are rejected", vr.slice(0, 3).every(([, s]) => s === 422), JSON.stringify(vr));
  info("look-alike names accepted next to 'Unique'", JSON.stringify(vr.slice(3).filter(([, s]) => s === 200).map(([v]) => v)) + " (zero-width / NBSP / accents are not folded: impersonation inside one table is possible; the owner approves every seat)");
  // 'Guest'
  const g3 = new Peer(S, "gst"); const w3 = g3.ws(g2); await w3.registered(); const gr1 = await g3.ingress(g2, 8, "Guest", 100); await owner2.post(`/games/${g2}/approve_player`, { playerID: g3.id });
  const g4 = new Peer(S, "gst2"); const w4 = g4.ws(g2); await w4.registered(); const gr2 = await g4.ingress(g2, 9, "Guest", 100); await owner2.post(`/games/${g2}/approve_player`, { playerID: g4.id });
  await sleep(150);
  const guests = Object.values(ow.frame.players).filter((p) => p.name === "Guest" && ow.frame.seats.some(([, id]) => id === p.id));
  defect("c-input-hardening.guest-name-unique", "c-input-hardening", guests.length <= 1, `${guests.length} seated players are all named 'Guest' (uniqueness check skips the reserved watcher name)`);
}
ok("no prototype pollution after all of the above", S.pollution() === "", S.pollution().trim());
ok("server process still running", !S.exited, "");
await S.stop();
finish("s04-input");
