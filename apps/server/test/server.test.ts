import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { diffFrames } from "@pokerthen/shared";
import { faultyFs, nodeFs } from "../src/persistence/fsio.js";
import { LIMITS } from "../src/limits.js";
import { Client, cleanup, publicDirWithIndex, seatGuest, startTest, type TestApp } from "./helpers.js";
import { fakeTiming } from "./fakeEngine.js";

const apps: TestApp[] = [];
const boot = async (o: Parameters<typeof startTest>[0] = {}) => { const t = await startTest(o); apps.push(t); return t; };
afterEach(async () => { for (const t of apps.splice(0)) { await t.stop().catch(() => {}); cleanup(t.dir); } fakeTiming.fold = 3000; fakeTiming.showdown = 6000; });

describe("http + security", () => {
  it("healthz, cookie flags, 302 for unknown game, SPA + static", async () => {
    const t = await boot({ publicDir: publicDirWithIndex() });
    const c = new Client(t);
    expect((await c.http("GET", "/healthz")).json.ok).toBe(true);
    const home = await c.http("GET", "/home");
    expect(home.status).toBe(200);
    const sc = home.headers.get("set-cookie")!;
    expect(sc).toMatch(/^ptn=[A-Za-z0-9_-]{50};/);
    expect(sc).toContain("HttpOnly"); expect(sc).toContain("SameSite=Lax"); expect(sc).toContain("Path=/"); expect(sc).toContain("Max-Age=31536000");
    expect(sc).not.toContain("Secure"); // plain http dev
    expect(home.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect((await c.http("GET", "/games/ptlAAAAAAAAAAAAAAAAAAAAA")).status).toBe(302);
    expect((await c.http("GET", "/assets/app-abc123.js")).headers.get("cache-control")).toContain("immutable");
    expect((await c.http("GET", "/nope.txt")).status).toBe(404);
    expect((await c.http("GET", "/../../etc/passwd")).status).toBe(404);
  });
  it("Secure cookie behind a trusted TLS proxy and in production", async () => {
    await expect(boot({ env: { WEBSITE_SITE_NAME: "x" } })).rejects.toThrow(/SESSION_SECRET/); // Azure without NODE_ENV is treated as production (Phase C)
    const t = await boot({ env: { WEBSITE_SITE_NAME: "x", SESSION_SECRET: "s" }, publicDir: publicDirWithIndex() });
    const r = await new Client(t).http("GET", "/home", undefined, { "x-forwarded-proto": "https" });
    expect(r.headers.get("set-cookie")).toContain("Secure");
    const p = await boot({ env: { NODE_ENV: "production", SESSION_SECRET: "s" }, publicDir: publicDirWithIndex() });
    expect((await new Client(p).http("GET", "/home")).headers.get("set-cookie")).toContain("Secure");
    await expect(boot({ env: { NODE_ENV: "production" } })).rejects.toThrow(/SESSION_SECRET/);
  });
  it("Origin check on unsafe methods and WebSocket upgrades", async () => {
    const t = await boot();
    const c = await new Client(t).init();
    const bad = new Client(t, "https://evil.example"); bad.cookie = c.cookie;
    expect((await bad.http("POST", "/new-game", { playerName: "Yash" })).status).toBe(403);
    const none = await fetch(t.base + "/new-game", { method: "POST", headers: { cookie: c.cookie, "content-type": "application/json" }, body: "{}" });
    expect(none.status).toBe(403);
    const gid = await c.newGame("Yash");
    const status = await new Promise<number | string>((res) => {
      const ws = new WebSocket(`${t.base.replace("http", "ws")}/ws?gameID=${gid}`, { headers: { origin: "https://evil.example", cookie: c.cookie } });
      ws.on("unexpected-response", (_q, r) => res(r.statusCode ?? 0)); ws.on("open", () => res("open")); ws.on("error", () => {});
    });
    expect(status).toBe(403);
    const noOrigin = await new Promise<number | string>((res) => {
      const ws = new WebSocket(`${t.base.replace("http", "ws")}/ws?gameID=${gid}`, { headers: { cookie: c.cookie } });
      ws.on("unexpected-response", (_q, r) => res(r.statusCode ?? 0)); ws.on("open", () => res("open")); ws.on("error", () => {});
    });
    expect(noOrigin).toBe(403);
    const allowed = await boot({ env: { ALLOWED_ORIGINS: "https://pokerthen.example" } });
    const a = await new Client(allowed, "https://pokerthen.example").init();
    expect((await a.http("POST", "/new-game", { playerName: "Yash" })).status).toBe(200);
  });
  it("new-game validation, session close codes, per-socket and per-IP caps", async () => {
    const t = await boot();
    const c = await new Client(t).init();
    expect((await c.http("POST", "/new-game", { playerName: " a " })).json).toEqual({ playerName: "must be unique and length must be between 2 and 14" });
    const gid = await c.newGame("Yash");
    const noCookie = new Client(t); // no session
    expect((await noCookie.ws(gid).closed).code).toBe(4401);
    expect((await c.ws("ptlAAAAAAAAAAAAAAAAAAAAA").closed).code).toBe(4404);
    const flood = c.ws(gid); await flood.registered();
    for (let i = 0; i < LIMITS.WS_MSG_BURST + 5; i++) flood.send({ t: "ping", ts: i });
    expect((await flood.closed).code).toBe(4430);
    const socks = Array.from({ length: LIMITS.MAX_SOCKETS_PER_IP }, () => c.ws(gid));
    await Promise.all(socks.map((s) => s.registered()));
    const extra = c.ws(gid);
    expect((await extra.closed).code).toBe(4429);
    expect(extra.msgs[0]).toMatchObject({ t: "failed", code: "too-many-connections" });
    socks.forEach((s) => s.close());
  });
  it("ingress validation, owner-only routes, csv, log redaction", async () => {
    const t = await boot();
    const owner = await new Client(t).init();
    const gid = await owner.newGame("Yash");
    const guest = await new Client(t).init();
    const bad = await guest.http("POST", `/games/${gid}/request_ingress`, { seat: 2, playerName: "", allowSpectator: false, stack: null });
    expect(bad.status).toBe(422); expect(bad.json.playerName).toBeTruthy(); expect(bad.json.stack).toBeTruthy();
    const dup = await guest.http("POST", `/games/${gid}/request_ingress`, { seat: 2, playerName: "yash", allowSpectator: false, stack: 100 });
    expect(dup.json).toEqual({ playerName: "must be unique on this game" });
    expect((await new Client(t).http("POST", `/games/${gid}/request_ingress`, {})).json).toEqual({ code: "missing_game_player" });
    const g = await seatGuest(t, owner, gid, "Bob", 2);
    expect((await g.http("POST", `/games/${gid}/start-game`, {})).status).toBe(403);
    expect((await owner.http("POST", `/games/${gid}/start-game`, {})).text).toBe("OK");
    const csv = await g.http("GET", `/games/${gid}/pokerthen_log_${gid}.csv`);
    expect(csv.text.startsWith("entry,at,order\n")).toBe(true);
    expect((await g.http("GET", `/games/${gid}/ledger_${gid}.csv`)).text).toContain("Bob");
    const l = (c: Client) => c.http("GET", `/api/games/${gid}/log_v3?hand_number=1`);
    const og = (await l(owner)).json.map((e: any) => e.msg).filter((m: string) => m.startsWith("Your hand is"));
    const gg = (await l(g)).json.map((e: any) => e.msg).filter((m: string) => m.startsWith("Your hand is"));
    expect(og.length).toBe(1); expect(gg.length).toBe(1); expect(og[0]).not.toBe(gg[0]);
    expect((await l(owner)).json[0].createdAt).toBeGreaterThan(1e14);
    expect((await owner.http("GET", `/api/games/${gid}/log_v3?hand_number=0`)).json).toEqual([]);
  });
});

describe("realtime", () => {
  it("registered, delta chain consistency, RUP, chat, mute, presence", async () => {
    fakeTiming.fold = 200;
    const t = await boot();
    const owner = await new Client(t).init();
    const gid = await owner.newGame("Yash");
    const ows = owner.ws(gid);
    await ows.registered();
    const guest = await seatGuest(t, owner, gid, "Bob", 2);
    const gws = guest.ws(gid);
    const reg = await gws.registered();
    expect(reg.frame.you.name).toBe("Bob");
    await ows.until(() => ows.frame?.players[guest.playerId]?.status === "inGame");
    await owner.http("POST", `/games/${gid}/start-game`, {});
    await ows.until(() => ows.frame?.hand);
    await gws.until(() => gws.frame?.hand);
    // fold-win then wait for the next hand via the timer
    const turn = ows.frame!.turn.playerId!;
    (turn === owner.playerId ? ows : gws).action("PLAYER_FOLD");
    await ows.until(() => ows.frame!.table.handNumber === 2, 3000);
    expect(ows.chainBreaks + gws.chainBreaks).toBe(0);
    // delta-built frame == fresh projection
    const fresh = owner.ws(gid); const fr = await fresh.registered();
    await ows.until(() => !diffFrames({ ...ows.frame!, meta: undefined }, { ...fr.frame, meta: undefined }));
    // RUP
    gws.action("RUP"); await gws.until(() => gws.msgs.some((m) => m.t === "rup"));
    // chat + history
    ows.send({ t: "chat", text: "hello" });
    await gws.until(() => gws.msgs.some((m) => m.t === "chat" && m.message.message === "hello"));
    ows.send({ t: "chat", text: "x".repeat(101) });
    gws.action("TOGGLE_MUTE_PLAYER", { otherPlayerID: owner.playerId });
    await gws.until(() => gws.frame!.you!.mutedIds.includes(owner.playerId));
    ows.send({ t: "chat", text: "muted msg" });
    await new Promise((r) => setTimeout(r, 150));
    expect(gws.msgs.some((m) => m.t === "chat" && m.message.message === "muted msg")).toBe(false);
    expect(gws.msgs.some((m) => m.t === "chat" && m.message.message.startsWith("xxx"))).toBe(false);
    // emoji
    ows.action("ME", { emoji: "😀" }); await gws.until(() => gws.msgs.some((m) => m.t === "nEM"));
    // presence
    gws.close(); guest.keep?.close();
    await ows.until(() => ows.frame!.players[guest.playerId]?.disconnectedSince);
    // keep-alive pong
    ows.send({ t: "ping", ts: 5 }); await ows.until(() => ows.msgs.some((m) => m.t === "pong" && m.ts === 5));
    fresh.close(); ows.close();
  });
});

describe("fairness endpoint", () => {
  it("commit public immediately, reveal only after the result window, no deck/masterSalt", async () => {
    fakeTiming.fold = 300;
    const t = await boot();
    const owner = await new Client(t).init();
    const gid = await owner.newGame("Yash");
    const ows = owner.ws(gid); await ows.registered();
    const guest = await seatGuest(t, owner, gid, "Bob", 2);
    const gws = guest.ws(gid); await gws.registered();
    await ows.until(() => ows.frame?.players[guest.playerId]?.status === "inGame");
    await owner.http("POST", `/games/${gid}/start-game`, {});
    await ows.until(() => ows.frame?.hand);
    const anon = new Client(t); // no cookie needed
    const pre = await anon.http("GET", `/api/games/${gid}/fairness/1`);
    expect(pre.status).toBe(200);
    expect(pre.json.commitment).toMatch(/^[0-9a-f]{64}$/); expect(pre.json.reveal).toBeNull();
    expect(JSON.stringify(pre.json)).not.toMatch(/deck|masterSalt/);
    (ows.frame!.turn.playerId === owner.playerId ? ows : gws).action("PLAYER_FOLD");
    await ows.until(() => ows.frame!.table.handNumber === 2, 3000);
    const post = await anon.http("GET", `/api/games/${gid}/fairness/1`);
    expect(post.json.reveal.cards).toBeDefined();
    expect(post.json.reveal.cards.length).toBe(0); // fold-win: nothing exposed
    expect((await anon.http("GET", `/api/games/${gid}/fairness/99`)).status).toBe(404);
    ows.close(); gws.close();
  });
});

describe("persistence", () => {
  it("state is durable before the broadcast and before the HTTP ack", async () => {
    const t = await boot();
    const owner = await new Client(t).init();
    const gid = await owner.newGame("Yash");
    const ows = owner.ws(gid); await ows.registered();
    const runner = t.app.registry.get(gid)!;
    const seen: Array<{ onDisk: number; mem: number }> = [];
    ows.onRaw = (s) => {
      if (JSON.parse(s).t !== "gC") return;
      seen.push({ onDisk: JSON.parse(readFileSync(join(t.dir, "tables", gid, "state.json"), "utf8")).seq, mem: runner.seq });
    };
    const guest = await new Client(t).init();
    await guest.http("POST", `/games/${gid}/request_ingress`, { seat: 3, playerName: "Bob", allowSpectator: false, stack: 500 });
    await ows.until(() => seen.length > 0);
    expect(seen.every((x) => x.onDisk === x.mem)).toBe(true);
    const diskAtAck = JSON.parse(readFileSync(join(t.dir, "tables", gid, "state.json"), "utf8")).seq;
    expect(diskAtAck).toBe(runner.seq);
  });
  it("a failing disk rejects the command, keeps state, broadcasts nothing, leaves no orphan lines", async () => {
    const budget = { n: -1 };
    const fs = faultyFs(nodeFs, budget);
    const t = await boot({ fs });
    const owner = await new Client(t).init();
    const gid = await owner.newGame("Yash");
    const ows = owner.ws(gid); await ows.registered();
    const guest = await seatGuest(t, owner, gid, "Bob", 2);
    const runner = t.app.registry.get(gid)!;
    await ows.until(() => ows.frame?.players[guest.playerId]?.status === "inGame");
    const before = { seq: runner.seq, state: JSON.stringify(runner.state), frames: ows.msgs.length };
    budget.n = fs.calls + 1; // allow the log append, fail the state write
    const r = await owner.http("POST", `/games/${gid}/start-game`, {});
    expect(r.status).toBe(503);
    await new Promise((x) => setTimeout(x, 100));
    expect(runner.seq).toBe(before.seq);
    expect(JSON.stringify(runner.state)).toBe(before.state);
    expect(ows.msgs.length).toBe(before.frames);
    budget.n = -1; // disk heals: retry succeeds, no duplicate seq lines
    expect((await owner.http("POST", `/games/${gid}/start-game`, {})).status).toBe(200);
    const lines = readFileSync(join(t.dir, "tables", gid, "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).seq);
    expect(lines.every((x: number) => x <= runner.seq)).toBe(true);
    expect(lines.filter((x: number) => x === before.seq + 1).length).toBe(lines.length - lines.filter((x: number) => x <= before.seq).length);
    const hand1 = (await owner.http("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json.filter((e: any) => e.msg.startsWith("-- starting"));
    expect(hand1.length).toBe(1); // no duplicate from the failed attempt
    expect(runner.seq).toBe(before.seq + 1);
  });
});
