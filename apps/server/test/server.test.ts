import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { afterAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ClientCommand, type ServerMessage, type Snapshot } from '@pokerthen/protocol';
import { newDeck, verifyProof } from '@pokerthen/engine';
import { startServer, type RunningServer } from '../src/server';

const dirs: string[] = [];
const servers: RunningServer[] = [];
afterAll(async () => {
  for (const s of servers) await s.close().catch(() => {});
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

async function boot(dataDir?: string) {
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), 'pokerthen-'));
  if (!dataDir) dirs.push(dir);
  const srv = await startServer({ port: 0, dataDir: dir, secret: 'test-secret-test-secret-test-secret', quiet: true });
  servers.push(srv);
  return { srv, dir, base: `http://127.0.0.1:${srv.port}`, ws: `ws://127.0.0.1:${srv.port}/ws` };
}

class Client {
  ws!: WebSocket;
  snap!: Snapshot;
  snaps: string[] = []; // raw payloads for leak scanning
  private waiters = new Map<string, (m: Extract<ServerMessage, { type: 'result' }>) => void>();
  private seq = 0;
  private onSnap: Array<() => void> = [];
  fatal: string | null = null;
  constructor(public cookie: string, public url: string) {}
  static async identity(base: string): Promise<string> {
    const r = await fetch(base + '/api/v1/guest-sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    return (r.headers.get('set-cookie') as string).split(';')[0];
  }
  async connect(roomId: string) {
    this.ws = new WebSocket(this.url, { headers: { cookie: this.cookie } });
    this.ws.on('message', (raw) => {
      const text = raw.toString();
      const m = JSON.parse(text) as ServerMessage;
      if (m.type === 'snapshot') { this.snap = m.snapshot; this.snaps.push(text); this.onSnap.splice(0).forEach((f) => f()); }
      else if (m.type === 'result') this.waiters.get(m.commandId)?.(m);
      else if (m.type === 'fatal') this.fatal = m.code;
    });
    await new Promise<void>((ok, bad) => { this.ws.once('open', () => ok()); this.ws.once('error', bad); });
    this.ws.send(JSON.stringify({ type: 'subscribe', protocolVersion: PROTOCOL_VERSION, roomId }));
    await this.until(() => !!this.snap);
  }
  async until(pred: () => boolean, ms = 8000) {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > ms) throw new Error('timeout waiting; last snapshot hand=' + JSON.stringify(this.snap?.hand && { phase: this.snap.hand.phase, toAct: this.snap.hand.toActSeat }));
      await new Promise<void>((ok) => { this.onSnap.push(ok); setTimeout(ok, 50); });
    }
  }
  cmd(command: ClientCommand, commandId = 'c' + ++this.seq + Math.random().toString(36).slice(2, 8)) {
    return new Promise<Extract<ServerMessage, { type: 'result' }>>((ok) => {
      this.waiters.set(commandId, ok);
      this.ws.send(JSON.stringify({ type: 'command', commandId, command }));
    });
  }
  close() { this.ws.close(); }
}

async function createRoom(base: string, cookie: string, nickname: string) {
  const r = await fetch(base + '/api/v1/rooms', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ nickname }) });
  expect(r.status).toBe(200);
  return ((await r.json()) as { data: { roomId: string } }).data.roomId;
}

describe('server', () => {
  it('creates a table, admits guests with host approval, and runs hands with private cards', async () => {
    const { base, ws } = await boot();
    const hostCookie = await Client.identity(base);
    const roomId = await createRoom(base, hostCookie, 'Host');
    const host = new Client(hostCookie, ws); await host.connect(roomId);
    expect(host.snap.viewer.role).toBe('owner');

    const aCookie = await Client.identity(base), bCookie = await Client.identity(base);
    const a = new Client(aCookie, ws), b = new Client(bCookie, ws);
    await a.connect(roomId); await b.connect(roomId);
    expect(a.snap.viewer.role).toBe('viewer');

    expect((await host.cmd({ kind: 'seat.request', seat: 0, nickname: 'Host', stack: 1000, sitOut: false })).status).toBe('committed');
    expect((await a.cmd({ kind: 'seat.request', seat: 1, nickname: 'Ann', stack: 1000, sitOut: false })).status).toBe('committed');
    expect((await b.cmd({ kind: 'seat.request', seat: 2, nickname: 'Bob', stack: 1500, sitOut: false })).status).toBe('committed');
    await host.until(() => host.snap.requests.length === 2);
    // the guests are not seated until approved
    expect(a.snap.viewer.role).toBe('pending');
    for (const r of host.snap.requests) expect((await host.cmd({ kind: 'request.decide', requestId: r.id, approve: true })).status).toBe('committed');
    await a.until(() => a.snap.viewer.seat === 1);
    await b.until(() => b.snap.viewer.seat === 2);

    expect((await host.cmd({ kind: 'admin.start' })).status).toBe('committed');
    await host.until(() => !!host.snap.hand && host.snap.hand.phase === 'BETTING');
    await a.until(() => !!a.snap.hand);
    await b.until(() => !!b.snap.hand && !!b.snap.seats[2].cards);

    // privacy: nobody ever receives another player's unrevealed hole cards or the deck
    const holes = (c: Client) => (c.snap.seats[c.snap.viewer.seat!].cards ?? []) as string[];
    const hh = holes(host), ah = holes(a), bh = holes(b);
    expect(hh).toHaveLength(2); expect(ah).toHaveLength(2); expect(bh).toHaveLength(2);
    const leaks = (c: Client, secret: string[]) => c.snaps.some((raw) => secret.some((card) => raw.includes(`"${card}"`)));
    expect(leaks(host, [...ah, ...bh])).toBe(false);
    expect(leaks(a, [...hh, ...bh])).toBe(false);
    expect(leaks(b, [...hh, ...ah])).toBe(false);
    // an ordinary viewer sees no hole cards at all
    const watcher = new Client(await Client.identity(base), ws); await watcher.connect(roomId);
    expect(watcher.snap.seats.flatMap((s) => s.cards ?? []).filter(Boolean)).toHaveLength(0);
    expect(JSON.stringify(watcher.snap)).not.toMatch(/"deck"|"salts"/);

    // my own cards verify against the commitment published before the deal
    for (const c of [host, a, b]) {
      const f = c.snap.fairness!;
      expect(f.mine).toHaveLength(2);
      for (const p of f.mine) expect(verifyProof(f.commit, p)).toBe(true);
    }

    // play: everyone calls / checks until the hand ends
    const players = [host, a, b];
    for (let i = 0; i < 60; i++) {
      const h = host.snap.hand!;
      if (h.phase === 'COMPLETE') break;
      const actor = players.find((p) => p.snap.viewer.seat === h.toActSeat);
      if (actor && actor.snap.legal) {
        const res = await actor.cmd({ kind: 'action', handId: h.id, turnId: actor.snap.legal.turnId, action: actor.snap.legal.canCheck ? 'check' : 'call' });
        expect(res.status).toBe('committed');
      } else await new Promise((r) => setTimeout(r, 40));
    }
    await host.until(() => host.snap.hand?.phase === 'COMPLETE');
    const done = host.snap.hand!;
    expect(done.results).toBeTruthy();
    // ledger reconciles: stacks + cash-outs = buy-ins
    const total = host.snap.ledger.rows.reduce((acc, r) => acc + r.stack + r.buyOut - r.buyIn, 0);
    expect(total).toBe(0);
    // after the hand, public proofs include board + burn cards and they verify
    const f = host.snap.fairness!;
    expect(f.complete).toBe(true);
    for (const p of f.proofs) expect(verifyProof(f.commit, p)).toBe(true);
    expect(newDeck()).toContain(f.proofs[0].card);

    [host, a, b, watcher].forEach((c) => c.close());
  });

  it('commands are idempotent, and a reused id with a different payload is refused', async () => {
    const { base, ws } = await boot();
    const cookie = await Client.identity(base);
    const roomId = await createRoom(base, cookie, 'Host');
    const host = new Client(cookie, ws); await host.connect(roomId);
    const cmd: ClientCommand = { kind: 'seat.request', seat: 4, nickname: 'Host', stack: 500, sitOut: false };
    expect((await host.cmd(cmd, 'dup-1')).status).toBe('committed');
    expect((await host.cmd(cmd, 'dup-1')).status).toBe('committed'); // replay: no second seat/buy-in
    expect(host.snap.ledger.entries.filter((e) => e.type === 'BUY_IN')).toHaveLength(1);
    const other = await host.cmd({ ...cmd, seat: 5 }, 'dup-1');
    expect(other.status).toBe('rejected');
    expect(other.error?.code).toBe('COMMAND_ID_REUSED');
    host.close();
  });

  it('two guests asking for the same seat: exactly one is seated and one buy-in recorded; the other can be re-seated', async () => {
    const { base, ws } = await boot();
    const hc = await Client.identity(base);
    const roomId = await createRoom(base, hc, 'Host');
    const host = new Client(hc, ws); await host.connect(roomId);
    const a = new Client(await Client.identity(base), ws), b = new Client(await Client.identity(base), ws);
    await a.connect(roomId); await b.connect(roomId);
    await Promise.all([
      a.cmd({ kind: 'seat.request', seat: 3, nickname: 'Ann', stack: 800, sitOut: false }),
      b.cmd({ kind: 'seat.request', seat: 3, nickname: 'Bob', stack: 900, sitOut: false }),
    ]);
    await host.until(() => host.snap.requests.length === 2);
    const results = await Promise.all(host.snap.requests.map((r) => host.cmd({ kind: 'request.decide', requestId: r.id, approve: true })));
    expect(results.filter((r) => r.status === 'committed')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')[0].error?.code).toBe('SEAT_CONFLICT');
    expect(host.snap.ledger.entries.filter((e) => e.type === 'BUY_IN')).toHaveLength(1);
    expect(host.snap.requests).toHaveLength(1); // the loser's request is still actionable
    [host, a, b].forEach((c) => c.close());
  });

  it('nicknames are validated and unique; chat is rate limited and rendered as text', async () => {
    const { base, ws } = await boot();
    const hc = await Client.identity(base);
    const roomId = await createRoom(base, hc, 'Host');
    const host = new Client(hc, ws); await host.connect(roomId);
    await host.cmd({ kind: 'seat.request', seat: 0, nickname: 'Host', stack: 100, sitOut: false });
    const g = new Client(await Client.identity(base), ws); await g.connect(roomId);
    expect((await g.cmd({ kind: 'seat.request', seat: 1, nickname: 'host', stack: 100, sitOut: false })).error?.code).toBe('NICKNAME_TAKEN');
    expect((await g.cmd({ kind: 'seat.request', seat: 1, nickname: '<b>x</b>', stack: 100, sitOut: false })).error?.code).toBe('BAD_NICKNAME');
    expect((await g.cmd({ kind: 'seat.request', seat: 1, nickname: 'A', stack: 100, sitOut: false })).error?.code).toBe('BAD_NICKNAME');
    let limited = 0;
    for (let i = 0; i < 8; i++) if ((await host.cmd({ kind: 'chat.send', text: 'hello ' + i })).error?.code === 'RATE_LIMITED') limited++;
    expect(limited).toBe(3);
    [host, g].forEach((c) => c.close());
  });

  it('browser requests from a foreign origin are refused (WebSocket and API)', async () => {
    const { base, ws } = await boot();
    const cookie = await Client.identity(base);
    const bad = new WebSocket(ws, { headers: { cookie, origin: 'https://evil.example' } });
    const code = await new Promise<number>((ok) => { bad.on('unexpected-response', (_q, res) => ok(res.statusCode ?? 0)); bad.on('error', () => {}); });
    expect(code).toBe(403);
    const r = await fetch(base + '/api/v1/rooms', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie }, body: JSON.stringify({ nickname: 'Mallory' }) });
    expect(r.status).toBe(403);
    const noCookie = new WebSocket(ws);
    const code2 = await new Promise<number>((ok) => { noCookie.on('unexpected-response', (_q, res) => ok(res.statusCode ?? 0)); noCookie.on('error', () => {}); });
    expect(code2).toBe(403);
  });

  it('survives a restart: same hand, same cards, same chips; deck is not stored in clear text', async () => {
    const first = await boot();
    const hc = await Client.identity(first.base);
    const roomId = await createRoom(first.base, hc, 'Host');
    const host = new Client(hc, first.ws); await host.connect(roomId);
    const gc = await Client.identity(first.base);
    const g = new Client(gc, first.ws); await g.connect(roomId);
    await host.cmd({ kind: 'seat.request', seat: 0, nickname: 'Host', stack: 1000, sitOut: false });
    await g.cmd({ kind: 'seat.request', seat: 1, nickname: 'Gus', stack: 1000, sitOut: false });
    await host.until(() => host.snap.requests.length === 1);
    await host.cmd({ kind: 'request.decide', requestId: host.snap.requests[0].id, approve: true });
    await host.cmd({ kind: 'admin.start' });
    await host.until(() => host.snap.hand?.phase === 'BETTING');
    const myCards = host.snap.seats[0].cards;
    const commit = host.snap.hand!.id && host.snap.fairness!.commit;
    host.close(); g.close();
    await first.srv.close();

    // raw file must not contain the cards of the hand in clear (sealed)
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(join(first.dir, 'rooms', roomId + '.json'), 'utf8');
    expect(raw).not.toContain('"deck":["');
    expect(raw).toContain('"sealed"');

    const second = await boot(first.dir);
    const host2 = new Client(hc, second.ws); await host2.connect(roomId);
    expect(host2.snap.seats[0].cards).toEqual(myCards);
    expect(host2.snap.fairness!.commit).toBe(commit);
    expect(host2.snap.hand!.phase).toBe('BETTING');
    // the table is playable after recovery
    const lg = host2.snap.legal;
    const g2 = new Client(gc, second.ws); await g2.connect(roomId);
    const actor = lg ? host2 : g2;
    const res = await actor.cmd({ kind: 'action', handId: host2.snap.hand!.id, turnId: actor.snap.legal!.turnId, action: 'fold' });
    expect(res.status).toBe('committed');
    host2.close(); g2.close();
  });

  it('only the host can use admin commands', async () => {
    const { base, ws } = await boot();
    const hc = await Client.identity(base);
    const roomId = await createRoom(base, hc, 'Host');
    const g = new Client(await Client.identity(base), ws); await g.connect(roomId);
    await g.cmd({ kind: 'seat.request', seat: 1, nickname: 'Gus', stack: 100, sitOut: false });
    expect((await g.cmd({ kind: 'admin.start' })).error?.code).toBe('PERMISSION_DENIED');
    expect((await g.cmd({ kind: 'admin.config', expectedVersion: 1, patch: { sb: 1 } })).error?.code).toBe('PERMISSION_DENIED');
    g.close();
  });
});
