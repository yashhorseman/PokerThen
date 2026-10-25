import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { clientMessageSchema, PROTOCOL_VERSION, validateNickname, type ServerMessage } from '@pokerthen/protocol';
import { Room } from './room';
import { Store } from './store';
import { csvCell, deriveKey, parseCookies, randomId, signIdentity, verifyIdentity } from './util';

export interface ServerOptions {
  port: number;
  dataDir: string;
  secret: string;
  staticDir?: string;
  secureCookies?: boolean;
  /** extra allowed Origin hosts for browser requests (same host is always allowed) */
  allowedOrigins?: string[];
  quiet?: boolean;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
  "connect-src 'self' ws: wss:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
].join('; ');

export interface RunningServer {
  server: Server;
  port: number;
  rooms: Map<string, Room>;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const store = new Store(opts.dataDir, deriveKey(opts.secret));
  const rooms = new Map<string, Room>();
  const log = (...a: unknown[]) => { if (!opts.quiet) console.log(...a); };

  for (const st of store.loadAll()) {
    const r = new Room(st);
    r.recover();
    rooms.set(st.id, r);
  }
  log(`loaded ${rooms.size} room(s) from ${opts.dataDir}`);

  /* ---------- helpers ---------- */
  const sockets = new Map<WebSocket, { identity: string; roomId: string | null; conn: string; bucket: number; bucketAt: number }>();

  const send = (ws: WebSocket, m: ServerMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  function broadcast(room: Room) {
    for (const [ws, info] of sockets) {
      if (info.roomId !== room.state.id) continue;
      send(ws, { type: 'snapshot', snapshot: room.snapshot(info.identity) });
    }
  }
  function flush(room: Room) {
    if (!room.dirtyFlag) return false;
    store.save(room.state);
    room.clearDirty();
    broadcast(room);
    return true;
  }

  const hostOf = (req: IncomingMessage) => String(req.headers.host ?? '');
  function sameOrigin(req: IncomingMessage): boolean {
    const o = req.headers.origin;
    if (!o) return true; // non-browser or same-origin GET
    try {
      const h = new URL(String(o)).host;
      return h === hostOf(req) || (opts.allowedOrigins ?? []).includes(h);
    } catch { return false; }
  }

  function identityFrom(req: IncomingMessage): string | null {
    return verifyIdentity(parseCookies(req.headers.cookie).pt_sid, opts.secret);
  }
  function cookieHeader(id: string) {
    return `pt_sid=${encodeURIComponent(signIdentity(id, opts.secret))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${opts.secureCookies ? '; Secure' : ''}`;
  }

  const hits = new Map<string, number[]>();
  function limited(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { hits.set(key, arr); return true; }
    arr.push(now); hits.set(key, arr);
    return false;
  }
  const ipOf = (req: IncomingMessage) => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim().replace(/:\d+$/, '');

  function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  }
  async function readJson(req: IncomingMessage, max = 8192): Promise<unknown> {
    const chunks: Buffer[] = [];
    let n = 0;
    for await (const c of req) { n += (c as Buffer).length; if (n > max) throw new Error('too large'); chunks.push(c as Buffer); }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  }

  /* ---------- HTTP ---------- */
  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : null;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const path = url.pathname;
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', CSP);
      if (opts.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');

      if (path === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });

      if (path.startsWith('/api/v1/')) {
        const write = req.method !== 'GET' && req.method !== 'HEAD';
        if (write && (!sameOrigin(req) || !String(req.headers['content-type'] ?? '').startsWith('application/json')))
          return json(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Cross-origin requests are not allowed.' } });

        if (path === '/api/v1/guest-sessions' && req.method === 'POST') {
          let id = identityFrom(req);
          const headers: Record<string, string> = {};
          if (!id) { id = randomId(16); headers['Set-Cookie'] = cookieHeader(id); }
          return json(res, 200, { ok: true, data: { identityId: id } }, headers);
        }

        if (path === '/api/v1/rooms' && req.method === 'POST') {
          if (limited('create:' + ipOf(req), 12, 3600_000)) return json(res, 429, { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many tables created. Try again later.', retryAfterMs: 60_000 } });
          let id = identityFrom(req);
          const headers: Record<string, string> = {};
          if (!id) { id = randomId(16); headers['Set-Cookie'] = cookieHeader(id); }
          const body = (await readJson(req)) as { nickname?: string; creationCommandId?: string };
          const nn = validateNickname(String(body.nickname ?? ''));
          if (!nn.ok) return json(res, 422, { ok: false, error: { code: 'BAD_NICKNAME', message: nn.message, fieldErrors: { nickname: nn.message } } }, headers);
          // idempotent creation: the same commandId from the same identity returns the same room
          const cid = String(body.creationCommandId ?? '').slice(0, 64);
          if (cid) {
            for (const r of rooms.values()) if (r.state.ownerId === id && (r.state as unknown as { creationCommandId?: string }).creationCommandId === cid) {
              return json(res, 200, { ok: true, data: { roomId: r.state.id, invitePath: '/t/' + r.state.id } }, headers);
            }
          }
          const roomId = randomId(16);
          const room = Room.create(roomId, id, nn.value);
          if (cid) (room.state as unknown as { creationCommandId?: string }).creationCommandId = cid;
          rooms.set(roomId, room);
          store.save(room.state);
          room.clearDirty();
          return json(res, 200, { ok: true, data: { roomId, invitePath: '/t/' + roomId } }, headers);
        }

        const m = path.match(/^\/api\/v1\/rooms\/([A-Za-z0-9_-]{8,64})(\/ledger\.csv)?$/);
        if (m && req.method === 'GET') {
          const room = rooms.get(m[1]);
          if (!room) return json(res, 404, { ok: false, error: { code: 'ROOM_NOT_FOUND', message: 'This table does not exist.' } });
          if (!m[2]) return json(res, 200, { ok: true, data: room.meta() });
          const id = identityFrom(req);
          if (!id || !room.state.members[id]) return json(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'Only players at this table can download the ledger.' } });
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ledger.csv"', 'Cache-Control': 'no-store' });
          return void res.end(room.ledgerCsv(csvCell));
        }
        return json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown endpoint.' } });
      }

      // static files + SPA fallback
      if (!staticRoot || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404); return void res.end('Not found'); }
      const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
      let file = join(staticRoot, rel);
      if (!file.startsWith(staticRoot)) { res.writeHead(403); return void res.end(); }
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(staticRoot, 'index.html');
      const ext = extname(file);
      const data = readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': rel.startsWith('/assets/') || rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) {
      console.error('http error', e instanceof Error ? e.message : e);
      if (!res.headersSent) json(res, 500, { ok: false, error: { code: 'INTERNAL', message: 'Server error.' } });
      else res.end();
    }
  });

  /* ---------- WebSocket ---------- */
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const id = identityFrom(req);
    if (url.pathname !== '/ws' || !sameOrigin(req) || !id) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return void socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.set(ws, { identity: id, roomId: null, conn: randomId(8), bucket: 30, bucketAt: Date.now() });
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const info = sockets.get(ws)!;
    const subscribeTimer = setTimeout(() => { if (!info.roomId) ws.close(4000, 'subscribe timeout'); }, 8000);

    ws.on('message', (raw) => {
      // token bucket: 30 burst, refills 20/s
      const now = Date.now();
      info.bucket = Math.min(30, info.bucket + ((now - info.bucketAt) / 1000) * 20);
      info.bucketAt = now;
      if (info.bucket < 1) return;
      info.bucket -= 1;

      let msg;
      try { msg = clientMessageSchema.safeParse(JSON.parse(raw.toString())); } catch { return void ws.close(4400, 'bad json'); }
      if (!msg.success) {
        // an invalid command still deserves an answer when we can tell which one it was
        try {
          const j = JSON.parse(raw.toString());
          if (j && j.type === 'command' && typeof j.commandId === 'string') {
            return send(ws, { type: 'result', commandId: j.commandId, status: 'rejected', version: 0, error: { code: 'BAD_REQUEST', message: 'That request was not understood.' } });
          }
        } catch { /* fallthrough */ }
        return;
      }
      const m = msg.data;
      if (m.type === 'ping') return send(ws, { type: 'pong', serverTime: Date.now() });
      if (m.type === 'subscribe') {
        if (m.protocolVersion !== PROTOCOL_VERSION) return send(ws, { type: 'fatal', code: 'PROTOCOL_UNSUPPORTED', message: 'This page is out of date. Please refresh.' });
        const room = rooms.get(m.roomId);
        if (!room) return send(ws, { type: 'fatal', code: 'ROOM_NOT_FOUND', message: 'This table does not exist.' });
        clearTimeout(subscribeTimer);
        info.roomId = m.roomId;
        room.conns.set(info.conn, info.identity);
        if (room.state.members[info.identity]) broadcast(room); // presence changed for others
        else send(ws, { type: 'snapshot', snapshot: room.snapshot(info.identity) });
        return;
      }
      if (m.type === 'command') {
        const room = info.roomId ? rooms.get(info.roomId) : undefined;
        if (!room) return send(ws, { type: 'fatal', code: 'ROOM_NOT_FOUND', message: 'Not subscribed to a table.' });
        const res = room.execute(info.identity, m.commandId, m.command);
        const wasDirty = room.dirtyFlag;
        if (wasDirty) store.save(room.state); // durable before acknowledging
        send(ws, res.ok
          ? { type: 'result', commandId: m.commandId, status: 'committed', version: room.state.version }
          : { type: 'result', commandId: m.commandId, status: 'rejected', error: res.error, version: room.state.version });
        if (wasDirty) { room.clearDirty(); broadcast(room); }
        else send(ws, { type: 'snapshot', snapshot: room.snapshot(info.identity) }); // rejected: resync the sender
      }
    });

    ws.on('close', () => {
      clearTimeout(subscribeTimer);
      const room = info.roomId ? rooms.get(info.roomId) : undefined;
      sockets.delete(ws);
      if (room) {
        room.conns.delete(info.conn);
        if (room.state.members[info.identity]) broadcast(room);
      }
    });
    ws.on('error', () => { /* handled by close */ });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (ws.alive === false) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30_000);

  const clock = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.state.status !== 'OPEN') continue;
      try { room.tick(); } catch (e) { console.error('tick failed', e); }
      flush(room);
    }
  }, 250);

  const housekeeping = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const s = room.state;
      const idle = now - s.lastActiveAt;
      if (s.status === 'OPEN' && room.conns.size === 0 && idle > 24 * 3600_000 && !(s.table.hand && s.table.hand.phase !== 'COMPLETE')) {
        s.status = 'CLOSED';
        room.log('system', 'This table was archived after 24 hours of inactivity.');
        room.touch();
        flush(room);
      }
    }
  }, 60_000);

  await new Promise<void>((ok) => server.listen(opts.port, ok));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  log(`PokerThen listening on :${port}`);

  return {
    server, port, rooms,
    async close() {
      clearInterval(clock); clearInterval(heartbeat); clearInterval(housekeeping);
      for (const room of rooms.values()) { room.touch(); store.save(room.state); }
      for (const ws of wss.clients) ws.close(1001, 'server shutting down');
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
}
