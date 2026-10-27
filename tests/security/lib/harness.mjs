// Phase C security harness: builds and runs the REAL server bundle (esbuild, same options as scripts/build.mjs) as a child process
// on a temp port + temp DATA_DIR, and provides raw HTTP / WebSocket / TCP helpers. Plain ESM, no TypeScript needed.
//
//   PT_ROOT      repo (or snapshot) root to build from            default: this repo
//   PT_SEC_TMP   scratch directory for bundles / data dirs        default: os.tmpdir()
//   PT_PUBLIC    directory served as the web build               default: <root>/dist/app/public (copied once)
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";
import net from "node:net";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { WebSocket } from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(process.env.PT_ROOT ?? join(HERE, "../../.."));
export const TMP = process.env.PT_SEC_TMP ?? tmpdir();
mkdirSync(TMP, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const mkTmp = (p = "x-") => mkdtempSync(join(TMP, `ptsec-${p}`));

/* ------------------------------------------------------------------ build + spawn */
let bundleCache = null;
export async function ensureBundle() {
  if (process.env.PT_BUNDLE) return process.env.PT_BUNDLE;
  if (bundleCache) return bundleCache;
  const { build } = await import("esbuild");
  const out = mkTmp("bundle-");
  const file = join(out, "server.cjs");
  await build({
    entryPoints: [join(ROOT, "apps/server/src/main.ts")], outfile: file, bundle: true, platform: "node", target: "node22", format: "cjs",
    sourcemap: false, minify: false, legalComments: "none", external: ["bufferutil", "utf-8-validate"], logLevel: "error"
  });
  bundleCache = file;
  return file;
}

let publicCache = null;
export function ensurePublic() {
  if (publicCache) return publicCache;
  const src = process.env.PT_PUBLIC ?? join(ROOT, "dist/app/public");
  const dst = mkTmp("public-");
  if (existsSync(join(src, "index.html"))) cpSync(src, dst, { recursive: true });
  else { writeFileSync(join(dst, "index.html"), "<!doctype html><title>PokerThen</title><div id=root></div>"); mkdirSync(join(dst, "assets"), { recursive: true }); writeFileSync(join(dst, "assets", "a.js"), "1"); }
  publicCache = dst;
  return dst;
}

export const TEST_SECRET = "sec-suite-" + randomBytes(12).toString("hex");

/** Start the built server. opts: env (overrides), dataDir, secret, fsizeBytes (RLIMIT_FSIZE via python), probe (pollution probe), args. */
export async function startServer(opts = {}) {
  const bundle = opts.bundle ?? (await ensureBundle());
  const dataDir = opts.dataDir ?? mkTmp("data-");
  const secret = opts.secret === undefined ? TEST_SECRET : opts.secret;
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR ?? "",
    NODE_ENV: "test", PORT: "0", DATA_DIR: dataDir, PUBLIC_DIR: opts.publicDir ?? ensurePublic(),
    ...(secret === null ? {} : { SESSION_SECRET: secret }),
    ...(opts.rotateIp ? { TRUST_PROXY: "1" } : {}),
    ...(opts.env ?? {})
  };
  for (const k of Object.keys(env)) if (env[k] === undefined || env[k] === null) delete env[k];
  const nodeArgs = [];
  if (opts.probe !== false) nodeArgs.push("--require", join(HERE, "pollution-probe.cjs"));
  nodeArgs.push(bundle);
  let cmd = process.execPath, args = nodeArgs;
  if (opts.fsizeBytes) {
    // RLIMIT_FSIZE + ignore SIGXFSZ: writes crossing the limit become SHORT writes, writes past it fail with EFBIG (the same shape as ENOSPC)
    const py = `import resource,signal,os,sys;n=int(sys.argv[1]);resource.setrlimit(resource.RLIMIT_FSIZE,(n,n));signal.signal(signal.SIGXFSZ,signal.SIG_IGN);os.execvp(sys.argv[2],sys.argv[2:])`;
    cmd = "python3"; args = ["-c", py, String(opts.fsizeBytes), process.execPath, ...nodeArgs];
  }
  const probeFile = join(dataDir, "..", `probe-${process.pid}-${Date.now()}.txt`);
  env.PT_PROBE_FILE = probeFile;
  const proc = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const S = { proc, dataDir, secret, env, bundle, out: [], err: [], exited: false, exitCode: null, probeFile, rotateIp: !!opts.rotateIp, tableDir: (id) => join(dataDir, "tables", id) };
  proc.stdout.on("data", (d) => S.out.push(String(d)));
  proc.stderr.on("data", (d) => S.err.push(String(d)));
  proc.on("exit", (code, sig) => { S.exited = true; S.exitCode = code ?? sig; });
  const t0 = Date.now();
  while (!S.port) {
    const m = /pokerthen listening on (\d+)/.exec(S.out.join(""));
    if (m) { S.port = Number(m[1]); break; }
    if (S.exited) throw Object.assign(new Error("server exited before listening: " + S.err.join("").slice(0, 600) + S.out.join("").slice(0, 300)), { S });
    if (Date.now() - t0 > 15000) { proc.kill("SIGKILL"); throw new Error("server did not start in 15 s: " + S.err.join("").slice(0, 600)); }
    await sleep(20);
  }
  S.base = `http://127.0.0.1:${S.port}`;
  S.origin = S.base;
  S.logs = () => S.out.join("") + S.err.join("");
  S.kill9 = async () => { if (!S.exited) { proc.kill("SIGKILL"); await waitExit(S); } };
  S.stop = async () => { if (!S.exited) { proc.kill("SIGTERM"); await Promise.race([waitExit(S), sleep(4000)]); if (!S.exited) proc.kill("SIGKILL"); await waitExit(S); } };
  S.pollution = () => (existsSync(probeFile) ? readFileSync(probeFile, "utf8") : "");
  return S;
}
async function waitExit(S) { const end = Date.now() + 6000; while (!S.exited && Date.now() < end) await sleep(20); }

/** restart on the same data dir (after a kill) */
export async function restartServer(S, opts = {}) {
  if (!S.exited) await S.kill9();
  return startServer({ rotateIp: S.rotateIp, ...opts, dataDir: S.dataDir, secret: S.secret, bundle: S.bundle, publicDir: S.env.PUBLIC_DIR, env: { ...S.env, PORT: "0", ...(opts.env ?? {}) } });
}

/* ------------------------------------------------------------------ raw HTTP */
/** One request on a fresh connection. headers may contain array values (duplicate headers). Returns {status, headers, text, json, cookies} */
export function rawHttp(S, { method = "GET", path = "/", headers = {}, body, timeout = 8000, noHost = false } = {}) {
  return new Promise((resolveP, reject) => {
    const h = { ...headers };
    if (S.rotateIp && !Object.keys(h).some((k) => k.toLowerCase() === "x-forwarded-for")) h["x-forwarded-for"] = fakeIp();
    const req = http.request({ host: "127.0.0.1", port: S.port, method, path, headers: h, agent: false, setHost: !noHost && !("host" in h) }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
        resolveP({ status: res.statusCode, headers: res.headers, text, json, cookies: res.headers["set-cookie"] ?? [], rawBytes: Buffer.concat(chunks) });
      });
    });
    req.setTimeout(timeout, () => { req.destroy(new Error("timeout")); });
    req.on("error", (e) => reject(e));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Raw TCP: send bytes, collect the reply until close/timeout. */
export function rawTcp(S, payload, { timeout = 3000, readUntilClose = true } = {}) {
  return new Promise((resolveP) => {
    const sock = net.connect(S.port, "127.0.0.1");
    const chunks = [];
    let done = false;
    const fin = (why) => { if (done) return; done = true; sock.destroy(); resolveP({ text: Buffer.concat(chunks).toString("utf8"), why }); };
    sock.on("connect", () => { for (const p of Array.isArray(payload) ? payload : [payload]) sock.write(p); });
    sock.on("data", (d) => { chunks.push(d); if (!readUntilClose) fin("data"); });
    sock.on("close", () => fin("close"));
    sock.on("error", () => fin("error"));
    setTimeout(() => fin("timeout"), timeout);
  });
}

/* ------------------------------------------------------------------ identities and peers */
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export function newToken(n = 50) { const b = randomBytes(n); let s = ""; for (let i = 0; i < n; i++) s += ALPHA[b[i] & 63]; return s; }
/** the server's playerId for a token when we know SESSION_SECRET (test servers only) */
export const playerIdFor = (secret, token) => createHmac("sha256", secret).update(token).digest("base64url").slice(0, 10);

let ipCounter = 1;
export function fakeIp() { const n = ipCounter++; return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`; }

/** Browser-like client: cookie, Origin header, optional X-Forwarded-For identity (server must run with TRUST_PROXY=1). */
export class Peer {
  constructor(S, label = "peer", { token = newToken(), ip = null, origin, extraHeaders = {}, noOrigin = false } = {}) {
    this.S = S; this.label = label; this.token = token; this.ip = ip; this.origin = origin ?? S.origin; this.extraHeaders = extraHeaders; this.noOrigin = noOrigin;
    this.id = playerIdFor(S.secret ?? TEST_SECRET, token);
  }
  get cookie() { return `ptn=${this.token}`; }
  headers(extra = {}, withBody = false) {
    return {
      ...(this.noOrigin ? {} : { origin: this.origin }), cookie: this.cookie, ...(this.ip ? { "x-forwarded-for": this.ip } : {}),
      ...(withBody ? { "content-type": "application/json" } : {}), ...this.extraHeaders, ...extra
    };
  }
  async http(method, path, body, extra = {}) {
    const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    return rawHttp(this.S, { method, path, headers: this.headers(extra, payload !== undefined), body: payload });
  }
  get(path, extra) { return this.http("GET", path, undefined, extra); }
  post(path, body, extra) { return this.http("POST", path, body, extra); }
  async newGame(name) {
    const r = await this.post("/new-game", { playerName: name, gM: "th", playerStack: 1000, bigBlind: 20, smallBlind: 10, cM: false });
    if (r.status !== 200) throw new Error(`new-game ${r.status} ${r.text}`);
    this.gameId = r.json.gameID;
    return r.json.gameID;
  }
  ws(gameId, opts = {}) { return new WsConn(this.S, this, gameId, opts); }
  /** request a seat as this peer (needs the WS to be connected first so the engine knows the watcher) */
  ingress(gameId, seat, name, stack = 1000, extra = {}) { return this.post(`/games/${gameId}/request_ingress`, { seat, playerName: name, allowSpectator: false, stack, ...extra }); }
}

export function applyDelta(base, delta) {
  if (delta === "<D>") return undefined;
  const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObj(delta) || !isObj(base)) return delta;
  const out = { ...base };
  for (const k of Object.keys(delta)) {
    const d = delta[k];
    if (d === "<D>") delete out[k];
    else if (isObj(d)) out[k] = applyDelta(isObj(out[k]) ? out[k] : {}, d);
    else out[k] = d;
  }
  return out;
}

/** WebSocket client that keeps the projected Frame (snapshot + delta chain) and every raw message. */
export class WsConn {
  constructor(S, peer, gameId, { query = "layout=d", headers = {}, url, noOrigin = false, origin, noCookie = false } = {}) {
    this.S = S; this.peer = peer; this.gameId = gameId;
    this.raw = []; this.msgs = []; this.frame = null; this.chainBreaks = 0; this.closeCode = null; this.closeReason = ""; this.status = null; this.opened = false; this.error = null;
    this.onFrame = null; this.onMessage = null; this.waiters = [];
    const u = url ?? `ws://127.0.0.1:${S.port}/ws?gameID=${gameId}&${query}`;
    const h = { ...(noOrigin ? {} : { origin: origin ?? peer.origin }), ...(noCookie ? {} : { cookie: peer.cookie }), ...(peer.ip ? { "x-forwarded-for": peer.ip } : S.rotateIp ? { "x-forwarded-for": fakeIp() } : {}), ...peer.extraHeaders, ...headers };
    this.ws = new WebSocket(u, { headers: h, handshakeTimeout: 8000, maxPayload: 64 * 1024 * 1024 });
    this.closed = new Promise((res) => {
      this.ws.on("close", (code, reason) => { this.closeCode = code; this.closeReason = String(reason ?? ""); this.wake(); res(code); });
    });
    this.ws.on("open", () => { this.opened = true; this.wake(); });
    this.ws.on("unexpected-response", (_req, res) => { this.status = res.statusCode; res.resume(); this.wake(); });
    this.ws.on("error", (e) => { this.error = e; this.wake(); });
    this.ws.on("message", (d) => {
      const s = String(d);
      this.raw.push(s);
      let m; try { m = JSON.parse(s); } catch { return; }
      this.msgs.push(m);
      if (m.t === "registered" || m.t === "rup") this.frame = m.frame;
      else if (m.t === "gC" && this.frame) {
        if (m.delta.meta.pre !== this.frame.meta.now) this.chainBreaks++;
        else this.frame = applyDelta(this.frame, m.delta);
      }
      if (this.onMessage) { try { this.onMessage(m, s, this); } catch (e) { this.cbError = e; } }
      this.wake();
    });
  }
  wake() { for (const w of this.waiters.splice(0)) w(); }
  send(o) { if (this.ws.readyState === 1) this.ws.send(typeof o === "string" ? o : JSON.stringify(o)); }
  sendRaw(buf) { this.ws.send(buf); }
  action(type, extra = {}) { this.send({ t: "action", action: { type, ...extra } }); }
  chat(text) { this.send({ t: "chat", text }); }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
  terminate() { try { this.ws.terminate(); } catch { /* ignore */ } }
  async until(pred, ms = 5000, what = "condition") {
    const end = Date.now() + ms;
    for (;;) {
      const v = pred(this);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timeout: ${what}; last: ${this.raw.slice(-2).join(" | ").slice(0, 300)}`);
      await new Promise((r) => { this.waiters.push(r); setTimeout(r, 25); });
    }
  }
  registered(ms = 5000) { return this.until(() => this.msgs.find((m) => m.t === "registered"), ms, "registered"); }
  /** resolves with {opened, status, closeCode} once the connection is either open, rejected at upgrade, or closed */
  async outcome(ms = 4000) {
    await this.until(() => this.opened || this.status || this.closeCode !== null || this.error, ms, "ws outcome").catch(() => {});
    return { opened: this.opened, status: this.status, closeCode: this.closeCode, error: this.error?.message ?? null };
  }
}

/* ------------------------------------------------------------------ table helpers */
/** owner creates a table, others connect + request seats, owner approves. Returns {gameId, owner, players:[Peer], conns:[WsConn]} */
export async function makeTable(S, names, { ip = () => null, seatFrom = 2, config = null, stack = 1000 } = {}) {
  const owner = new Peer(S, names[0], { ip: ip() });
  const gameId = await owner.newGame(names[0]);
  const ownerWs = owner.ws(gameId); await ownerWs.registered();
  const players = [owner], conns = [ownerWs];
  for (let i = 1; i < names.length; i++) {
    const p = new Peer(S, names[i], { ip: ip() });
    const w = p.ws(gameId); await w.registered();
    const r = await p.ingress(gameId, seatFrom + i - 1, names[i], stack);
    if (r.status !== 200) throw new Error(`ingress ${names[i]} ${r.status} ${r.text}`);
    const a = await owner.post(`/games/${gameId}/approve_player`, { playerID: p.id });
    if (a.status !== 200) throw new Error(`approve ${names[i]} ${a.status} ${a.text}`);
    players.push(p); conns.push(w);
  }
  if (config) {
    const cur = (await owner.get(`/games/${gameId}/current_or_next_configs`)).json; delete cur.queued;
    const r = await owner.post(`/games/${gameId}/update_game`, { ...cur, ...config });
    if (r.status !== 200) throw new Error(`update_game ${r.status} ${r.text}`);
  }
  return { gameId, owner, players, conns };
}

/* ------------------------------------------------------------------ misc */
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export function fileMode(p) { return statSync(p).mode & 0o777; }
export const oct = (n) => "0" + n.toString(8);
export function listFiles(dir) { const out = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; if (existsSync(dir)) walk(dir); return out; }
export function cleanup(...dirs) { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } }
/** import a TS module of the repo/snapshot (needs the tsx loader: run the test with `tsx` or `node --import tsx`) */
export const importFromRoot = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
export function readTableState(S, gameId) {
  try { return JSON.parse(readFileSync(join(S.dataDir, "tables", gameId, "state.json"), "utf8")); } catch { return null; }
}
