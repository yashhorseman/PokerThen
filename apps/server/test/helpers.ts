import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { applyDelta, type EngineApi, type Frame, type PlayerId } from "@pokerthen/shared";
import { startApp, type RunningApp } from "../src/app.js";
import { loadEnv, type Env } from "../src/env.js";
import type { DurableFs } from "../src/persistence/fsio.js";
import { fakeEngine } from "./fakeEngine.js";

export interface TestApp { app: RunningApp; base: string; dir: string; env: Env; stop(): Promise<void> }

export async function startTest(opts: { engine?: EngineApi; entropy?: import("@pokerthen/shared").Entropy; dir?: string; fs?: DurableFs; env?: Record<string, string>; publicDir?: string } = {}): Promise<TestApp> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), "pt-srv-"));
  const env = loadEnv({ NODE_ENV: "test", PORT: "0", DATA_DIR: dir, ...(opts.publicDir ? { PUBLIC_DIR: opts.publicDir } : {}), ...(opts.env ?? {}) } as NodeJS.ProcessEnv);
  const app = await startApp({ env, engine: opts.engine ?? fakeEngine, ...(opts.entropy ? { entropy: opts.entropy } : {}), ...(opts.fs ? { fs: opts.fs } : {}), log: () => {} });
  return { app, base: `http://127.0.0.1:${app.port}`, dir, env, stop: () => app.close() };
}
export const cleanup = (dir: string): void => rmSync(dir, { recursive: true, force: true });

export function publicDirWithIndex(): string {
  const d = mkdtempSync(join(tmpdir(), "pt-pub-"));
  mkdirSync(join(d, "assets"));
  writeFileSync(join(d, "index.html"), "<!doctype html><title>PokerThen</title><div id=root></div>");
  writeFileSync(join(d, "assets", "app-abc123.js"), "console.log(1)");
  return d;
}

/** Browser-like client: cookie jar + Origin on every request. */
export class Client {
  cookie = "";
  playerId = "";
  keep?: WsClient;
  constructor(readonly t: TestApp, readonly origin?: string) {}
  get origin_(): string { return this.origin ?? this.t.base; }

  async http(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; headers: Headers; text: string; json: any }> {
    const headers: Record<string, string> = { origin: this.origin_, ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(this.t.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const sc = r.headers.getSetCookie?.() ?? [];
    for (const c of sc) { const m = c.match(/^ptn=([^;]+)/); if (m) this.cookie = `ptn=${m[1]}`; }
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* text */ }
    return { status: r.status, headers: r.headers, text, json };
  }
  async init(): Promise<this> {
    const r = await this.http("GET", "/current-player-infos");
    this.playerId = r.json.id;
    return this;
  }
  async newGame(name: string): Promise<string> {
    const r = await this.http("POST", "/new-game", { playerName: name, gM: "th", playerStack: 1000, bigBlind: 20, smallBlind: 10, cM: false });
    if (r.status !== 200) throw new Error(`new-game ${r.status} ${r.text}`);
    return r.json.gameID;
  }
  ws(gameID: string, query = "layout=d"): WsClient { return new WsClient(this, gameID, query); }
}

export class WsClient {
  ws: WebSocket;
  msgs: any[] = [];
  raw: string[] = [];
  frame: Frame | null = null;
  chainBreaks = 0;
  closed: Promise<{ code: number }>;
  closeCode: number | null = null;
  private waiters: Array<() => void> = [];
  onRaw?: (s: string) => void;
  constructor(readonly c: Client, readonly gameID: string, query: string) {
    this.ws = new WebSocket(`${c.t.base.replace("http", "ws")}/ws?gameID=${gameID}&${query}`, { headers: { origin: c.origin_, ...(c.cookie ? { cookie: c.cookie } : {}) } });
    this.ws.on("message", (d) => {
      const s = String(d);
      this.raw.push(s);
      this.onRaw?.(s);
      const m = JSON.parse(s);
      this.msgs.push(m);
      if (m.t === "registered" || m.t === "rup") this.frame = m.frame;
      else if (m.t === "gC" && this.frame) {
        if (m.delta.meta.pre !== this.frame.meta.now) this.chainBreaks++;
        else this.frame = applyDelta(this.frame, m.delta);
      }
      for (const w of this.waiters.splice(0)) w();
    });
    this.closed = new Promise((res) => this.ws.on("close", (code) => { this.closeCode = code; for (const w of this.waiters.splice(0)) w(); res({ code }); }));
    this.ws.on("error", () => {});
  }
  send(o: unknown): void { this.ws.send(JSON.stringify(o)); }
  action(type: string, extra: object = {}): void { this.send({ t: "action", action: { type, ...extra } }); }
  async until<T>(pred: () => T | undefined | false | null, ms = 4000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = pred();
      if (v) return v;
      if (Date.now() > end) throw new Error("timeout waiting; last msgs: " + this.raw.slice(-3).join(" | ").slice(0, 600));
      await new Promise<void>((r) => { this.waiters.push(r); setTimeout(r, 25); });
    }
  }
  registered(): Promise<any> { return this.until(() => this.msgs.find((m) => m.t === "registered")); }
  close(): void { this.ws.close(); }
}

/** Seat a guest: request ingress via HTTP, owner approves. Returns the guest client. */
export async function seatGuest(t: TestApp, owner: Client, gameID: string, name: string, seat: number): Promise<Client> {
  const g = await new Client(t).init();
  await g.http("GET", `/games/${gameID}`);
  const w = g.ws(gameID); await w.registered(); // the real client connects first (presence registers the watcher in the engine)
  g.keep = w;
  const r = await g.http("POST", `/games/${gameID}/request_ingress`, { seat, playerName: name, allowSpectator: false, stack: 1000 });
  if (r.status !== 200) throw new Error("ingress " + r.status + r.text);
  const a = await owner.http("POST", `/games/${gameID}/approve_player`, { playerID: g.playerId });
  if (a.status !== 200) throw new Error("approve " + a.status + a.text);
  return g;
}
export type { PlayerId };
