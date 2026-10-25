/**
 * PokerThen server: HTTP (static SPA, /new-game, csv) + WebSocket (/ws) on process.env.PORT.
 * Hosting rules (docs/SPEC.md, Azure App Service): listen on PORT on all interfaces, one instance, WebSockets with 20s app pings,
 * TLS terminated by the front end (trust X-Forwarded-*), Origin checked on upgrades, persistent state only under DATA_DIR (/home/data).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createGame, restoreGame } from '../engine';
import { NICKNAME_ERROR } from '../shared/protocol';
import { LIMITS, TIMING } from '../shared/constants';
import { Identity, clientIp, isSecure } from './identity';
import { Persistence } from './persist';
import { Room, type Client } from './room';
import { StaticFiles } from './static';
import { GAME_ID_RE, newGameId } from './ids';
import { cryptoRandom } from './rng';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || (process.env.WEBSITE_SITE_NAME ? '/home/data' : './data');
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(__dirname, 'public');
const DEV_ROUTES = process.env.ENABLE_DEV_ROUTES === '1' || process.env.NODE_ENV === 'development';
const MAX_GAMES = Number(process.env.MAX_GAMES) || 2000;
const MAX_WS_PER_IP = Number(process.env.MAX_WS_PER_IP) || 60;
const NEW_GAMES_PER_IP_PER_HOUR = Number(process.env.NEW_GAMES_PER_IP_PER_HOUR) || 30;
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const persist = new Persistence(DATA_DIR);
const identity = new Identity(persist.secret());
const files = new StaticFiles(PUBLIC_DIR);
const rooms = new Map<string, Room>();
const wsPerIp = new Map<string, number>();
const newGameLog = new Map<string, number[]>();

// ── load persisted tables ──
for (const { id, json } of persist.loadAll()) {
  try {
    const room = new Room(restoreGame(json, cryptoRandom), persist);
    rooms.set(id, room);
    room.tick(); // resume timers / catch up
  } catch (e) { console.error('failed to restore table', id, e); }
}
console.log(`PokerThen: restored ${rooms.size} table(s) from ${DATA_DIR}`);

// ── helpers ──
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(s), 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra });
  res.end(s);
}
function readBody(req: IncomingMessage, limit = 8 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function allowNewGame(ip: string): boolean {
  const now = Date.now();
  const list = (newGameLog.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= NEW_GAMES_PER_IP_PER_HOUR) { newGameLog.set(ip, list); return false; }
  list.push(now); newGameLog.set(ip, list); return true;
}
function csvResponse(res: ServerResponse, name: string, body: string) {
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
  res.end(body);
}
function spa(req: IncomingMessage, res: ServerResponse) {
  if (!files.serve(req, res, '/index.html', SECURITY_HEADERS)) { res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('client not built'); }
}

// ── HTTP ──
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }

    if (path === '/new-game' && method === 'POST') {
      const ip = clientIp(req);
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { message: 'bad request' }); }
      const name = String(body.playerName ?? '').trim();
      if (name.length < LIMITS.NICKNAME_MIN || name.length > LIMITS.NICKNAME_MAX) return json(res, 422, { playerName: NICKNAME_ERROR });
      if (rooms.size >= MAX_GAMES) return json(res, 503, { message: 'server is full' });
      if (!allowNewGame(ip)) return json(res, 429, { message: 'too many tables created, try again later' });
      const pid = identity.ensure(req, res, isSecure(req));
      let id = newGameId(); while (rooms.has(id)) id = newGameId();
      const game = createGame({ id, ownerId: pid, ownerName: name, ownerStack: 1000, smallBlind: 10, bigBlind: 20, now: Date.now(), rng: cryptoRandom });
      const room = new Room(game, persist);
      rooms.set(id, room);
      room.commit();
      return json(res, 200, { gameID: id, playerID: pid, isNetworkPlayer: false, playerUsername: name });
    }

    if (path === '/current-player-infos' && method === 'GET') {
      const pid = identity.ensure(req, res, isSecure(req));
      return json(res, 200, { id: pid, networkUsername: null, isNetworkPlayer: false, isPremium: false, plusPlan: null, email: null, profilePicUrl: null, nowCoins: 0, hasNewHighlights: false, phone: '', allowPremium: false, badges: [] });
    }

    // /games/<id>[/ledger_<id>.csv | /poker_now_log_<id>.csv]
    const gm = /^\/games\/([A-Za-z0-9_-]+)(?:\/(.*))?$/.exec(path);
    if (gm && (method === 'GET' || method === 'HEAD')) {
      const id = gm[1]!;
      const room = GAME_ID_RE.test(id) ? rooms.get(id) : undefined;
      if (!room) { res.writeHead(302, { Location: '/', ...SECURITY_HEADERS }); res.end(); return; }
      const pid = identity.ensure(req, res, isSecure(req));
      const sub = gm[2];
      if (!sub) return spa(req, res);
      if (sub === `ledger_${id}.csv`) { room.game.ensurePlayer(pid, Date.now()); return csvResponse(res, `ledger_${id}.csv`, room.game.ledgerCsv()); }
      if (sub === `poker_now_log_${id}.csv`) { room.game.ensurePlayer(pid, Date.now()); return csvResponse(res, `poker_now_log_${id}.csv`, room.game.logCsv()); }
      res.writeHead(404); res.end(); return;
    }

    if (method !== 'GET' && method !== 'HEAD') { res.writeHead(405); res.end(); return; }

    // static assets, then SPA routes
    if (path !== '/' && path !== '/index.html' && files.has(path)) {
      identity.ensure(req, res, isSecure(req));
      files.serve(req, res, path, SECURITY_HEADERS); return;
    }
    if (path === '/' || path === '/home' || path === '/start-game' || (DEV_ROUTES && path.startsWith('/__dev'))) {
      identity.ensure(req, res, isSecure(req));
      return spa(req, res);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS }); res.end('Not found');
  } catch (e) {
    console.error('http error', e);
    if (!res.headersSent) { res.writeHead(500); res.end('error'); }
  }
});

// ── WebSocket ──
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

function originOk(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    return host === req.headers.host || extraOrigins.includes(origin) || extraOrigins.includes(host);
  } catch { return false; }
}

server.on('upgrade', (req, socket, head) => {
  const reject = (code: number, text: string) => { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') return reject(404, 'Not Found');
  if (!originOk(req)) return reject(403, 'Forbidden');
  const ip = clientIp(req);
  wss.handleUpgrade(req, socket, head, (ws) => {
    const fail = (code: string, msg?: string) => { ws.send(JSON.stringify({ t: 'failed', code, msg })); ws.close(4000, code); };
    const token = identity.tokenFrom(req);
    if (!token) return fail('session-missing-token');
    const n = wsPerIp.get(ip) ?? 0;
    if (n >= MAX_WS_PER_IP) return fail('too-many-connections');
    const gameID = url.searchParams.get('gameID') ?? '';
    const room = GAME_ID_RE.test(gameID) ? rooms.get(gameID) : undefined;
    if (!room) return fail('not-found');
    wsPerIp.set(ip, n + 1);
    const now = Date.now();
    const c: Client = { ws, playerId: identity.playerIdFor(token), ip, layout: url.searchParams.get('layout') === 'm' ? 'm' : 'd', alive: true, lastSeen: now, tokens: 60, tokensAt: now };
    if (!room.join(c)) { wsPerIp.set(ip, n); return fail('too-many-connections'); }
    ws.on('message', (data) => { try { room.handle(c, data.toString()); } catch (e) { console.error('message error', e); } });
    ws.on('pong', () => { c.lastSeen = Date.now(); });
    const cleanup = () => { room.leave(c); const k = (wsPerIp.get(ip) ?? 1) - 1; if (k <= 0) wsPerIp.delete(ip); else wsPerIp.set(ip, k); };
    ws.on('close', cleanup);
    ws.on('error', () => { /* close follows */ });
  });
});

// protocol-level liveness: ping every 15s, terminate sockets silent for PING_TIMEOUT_MS
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) { room.reap(now); for (const c of room.clients) if (c.ws.readyState === 1) c.ws.ping(); }
}, 15_000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`PokerThen listening on :${PORT} (data: ${DATA_DIR}, public: ${PUBLIC_DIR}${existsSync(PUBLIC_DIR) ? '' : ' MISSING'})`));

function shutdown(sig: string) {
  console.log(`${sig}: persisting ${rooms.size} table(s)`);
  for (const room of rooms.values()) { try { room.commit(); persist.save(room.id, room.game.serialize()); } catch (e) { console.error(e); } }
  server.close(); process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
void TIMING;
