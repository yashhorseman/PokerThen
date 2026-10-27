import type { IncomingMessage, ServerResponse } from "node:http";
import type { CommandResult, CurrentPlayerInfos, EngineApi, EngineCommand, Health, NewGameResponse } from "@pokerthen/shared";
import { DEFAULT_STACK, FIELD_ERRORS, NAME_MAX, NAME_MIN, PLACEHOLDERS, PROTOCOL_VERSION, STACK_MAX, defaultGameConfig } from "@pokerthen/shared";
import { newGameSchema, playerIdSchema, requestIngressSchema } from "@pokerthen/shared/validators";
import { z } from "zod";
import type { Env } from "../env.js";
import { LIMITS, RateWindow } from "../limits.js";
import { PersistenceError } from "../persistence/tableStore.js";
import { clientIp, contentSecurityPolicy, isUnsafeRequestAllowed, requestHost } from "../security.js";
import { GAME_ID_RE } from "../session.js";
import type { Registry } from "../tables/registry.js";
import type { ExecResult, TableRunner } from "../tables/runner.js";
import { logCsv, csvRow } from "../logs/store.js";
import { ensureSession, identify, type Me } from "./session-http.js";
import { resolvePublicDir, serveFile } from "./static.js";

export interface AppCtx {
  env: Env;
  engine: EngineApi;
  registry: Registry;
  clock: () => number;
  log: (msg: string, err?: unknown) => void;
  startedAt: number;
}

const SPA_ROUTES = new Set(["/", "/home", "/start-game", "/verify", "/poker-tutorial"]);

class HttpError extends Error { constructor(readonly status: number, readonly body: unknown) { super(String(status)); } }

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) return;
  const isText = typeof body === "string";
  const payload = isText ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > LIMITS.MAX_BODY_BYTES) throw new HttpError(413, { code: "payload-too-large" });
    chunks.push(c as Buffer);
  }
  if (n === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, { code: "bad-json" }); }
}

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, { code: "bad-request" });
  return r.data;
}

const toText = (res: ServerResponse): void => send(res, 200, "OK");

/** Map a failed engine/persistence result to the wire shape of SPEC 2.3 / ARCH 5.1. */
function failure(res: ServerResponse, r: Exclude<ExecResult, { ok: true }>, shape: "errors" | "value" | "message" = "errors"): void {
  if (r.status === 422) {
    const rr = r as Extract<CommandResult, { ok: false }>;
    if (shape === "value") return send(res, 422, { value: rr.value ?? PLACEHOLDERS.START_GAME_ERROR }); // U-J2
    if (shape === "message") return send(res, 422, { message: rr.value ?? Object.values(rr.errors ?? {})[0] ?? PLACEHOLDERS.FIELD_ERROR });
    return send(res, 422, rr.errors ?? (rr.value !== undefined ? { value: rr.value } : {}));
  }
  const code = (r as { code?: string }).code ?? (r.status === 403 ? "forbidden" : r.status === 400 ? "bad-request" : "server-error");
  send(res, r.status, { code });
}

export function createHandler(app: AppCtx): (req: IncomingMessage, res: ServerResponse) => void {
  const { env, registry, engine } = app;
  const publicDir = resolvePublicDir(env.publicDir);
  const httpRate = new RateWindow(LIMITS.HTTP_BURST, LIMITS.HTTP_WINDOW_MS, app.clock);
  const newGameRate = new RateWindow(LIMITS.NEW_GAME_PER_MIN, 60_000, app.clock);
  const logRate = new RateWindow(LIMITS.LOG_PER_IP_BURST, LIMITS.LOG_WINDOW_MS, app.clock);

  const need = (req: IncomingMessage): Me => {
    const me = identify(req, env);
    if (!me) throw new HttpError(403, { code: "missing_game_player" });
    return me;
  };
  const table = (id: string): TableRunner => {
    const t = registry.get(id);
    if (!t) throw new HttpError(404, "Not found");
    return t;
  };
  const owner = (t: TableRunner, me: Me): void => {
    if (!engine.isOwner(t.state, me.id)) throw new HttpError(403, { code: "not_owner" });
  };
  const frameOf = (t: TableRunner, viewer: string | null) => engine.frame(t.state, viewer, app.clock());

  async function serveIndex(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (await serveFile(req, res, publicDir, "index.html")) return;
    if (!env.isProd) {
      try { // dev convenience: the Vite dev server owns index.html until a build exists
        const r = await fetch(env.devViteUrl + "/");
        const html = await r.text();
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
        res.end(req.method === "HEAD" ? undefined : html);
        return;
      } catch { /* fall through */ }
    }
    send(res, 503, "Web build missing: run npm run build");
  }

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? "GET";
    const path = url.pathname;
    const ip = clientIp(req, env);

    if (method === "GET" || method === "HEAD") {
      if (path === "/healthz") {
        const h: Health = { ok: true, version: PROTOCOL_VERSION, uptimeSec: Math.floor((app.clock() - app.startedAt) / 1000), tables: registry.size };
        return send(res, 200, h);
      }
      if (path === "/current-player-infos") {
        const me = ensureSession(req, res, env);
        const body: CurrentPlayerInfos = { id: me.id, networkUsername: null, isNetworkPlayer: false };
        return send(res, 200, body);
      }
      let m: RegExpMatchArray | null;
      if (SPA_ROUTES.has(path)) { ensureSession(req, res, env); return serveIndex(req, res); }
      if ((m = path.match(/^\/games\/([^/]+)$/))) {
        if (!GAME_ID_RE.test(m[1]!) || !registry.get(m[1]!)) { res.writeHead(302, { location: "/", "cache-control": "no-store" }); return void res.end(); }
        ensureSession(req, res, env);
        return serveIndex(req, res);
      }
      if ((m = path.match(/^\/api\/games\/([^/]+)\/fairness\/(\d{1,9})$/))) {
        const t = table(m[1]!); // public: no cookie needed (SPEC 20.5)
        const rec = t.fairness.record(Number(m[2]));
        if (!rec) throw new HttpError(404, "Not found");
        return send(res, 200, rec);
      }
      if ((m = path.match(/^\/api\/games\/([^/]+)\/log_v3$/))) {
        const me = need(req);
        const t = table(m[1]!);
        if (!logRate.hit(ip)) throw new HttpError(429, { code: "too-many-actions" });
        const hand = Number(url.searchParams.get("hand_number") ?? "0");
        const after = url.searchParams.get("after_at");
        if (!Number.isInteger(hand) || hand < 0 || (after !== null && !/^\d{1,18}$/.test(after))) throw new HttpError(400, { code: "bad-request" });
        return send(res, 200, t.logs.forHand(hand, me.id, after === null ? undefined : Number(after)));
      }
      if ((m = path.match(/^\/games\/([^/]+)\/(players_sessions|current_or_next_configs)$/))) {
        need(req);
        const t = table(m[1]!);
        if (m[2] === "players_sessions") return send(res, 200, engine.ledger(t.state));
        if (engine.currentOrNextConfig) return send(res, 200, engine.currentOrNextConfig(t.state));
        const f = frameOf(t, null);
        return send(res, 200, { ...f.table.config, queued: f.table.configQueued }); // fallback for engines without the optional method
      }
      if ((m = path.match(/^\/games\/([^/]+)\/players_sessions\/([^/]+)$/))) {
        need(req);
        return send(res, 200, engine.ledgerSessions(table(m[1]!).state, decodeURIComponent(m[2]!)));
      }
      if ((m = path.match(/^\/games\/([^/]+)\/players\/([^/]+)$/))) {
        const me = need(req);
        const t = table(m[1]!);
        owner(t, me);
        const pid = decodeURIComponent(m[2]!);
        if (engine.playerEdit) {
          const e = engine.playerEdit(t.state, pid);
          if (!e) throw new HttpError(404, "Not found");
          return send(res, 200, e);
        }
        const p = frameOf(t, me.id).players[pid];
        if (!p) throw new HttpError(404, "Not found");
        return send(res, 200, { player: p, enqueuedChanges: [] }); // fallback for engines without the optional method
      }
      if ((m = path.match(/^\/games\/([^/]+)\/(ledger|pokerthen_log)_([^/]+)\.csv$/))) {
        const me = need(req);
        const t = table(m[1]!);
        if (m[3] !== m[1]) throw new HttpError(404, "Not found");
        let csv: string;
        if (m[2] === "pokerthen_log") {
          if (!logRate.hit(ip)) throw new HttpError(429, { code: "too-many-actions" });
          csv = logCsv(t.logs.forViewer(me.id));
        } else csv = ledgerCsv(engine, t);
        return send(res, 200, csv, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${m[2]}_${m[1]}.csv"` });
      }
      // static files (hashed assets, art, fonts)
      if (path.startsWith("/api/") || path.startsWith("/games/")) throw new HttpError(404, "Not found");
      if (path.includes("\0") || path.split("/").some((s) => s === "..")) throw new HttpError(404, "Not found");
      if (await serveFile(req, res, publicDir, path)) return;
      throw new HttpError(404, "Not found");
    }

    if (method !== "POST") return send(res, 405, { code: "method-not-allowed" }, { allow: "GET, HEAD, POST" });

    /* ---------------- POST ---------------- */
    if (!httpRate.hit(ip)) throw new HttpError(429, { code: "too-many-actions" });
    if (!isUnsafeRequestAllowed(req, env)) throw new HttpError(403, { code: "bad-origin" });

    if (path === "/new-game") {
      const body = parse(newGameSchema, await readJson(req));
      if (!newGameRate.hit(ip)) throw new HttpError(429, { code: "too-many-actions" });
      const name = body.playerName.trim();
      if ([...name].length < NAME_MIN || [...name].length > NAME_MAX) throw new HttpError(422, { playerName: FIELD_ERRORS.nameInvalid });
      // stack: optional (older clients send 1000); when present it must be a whole number in the same range as the seat form
      const stack = body.playerStack ?? DEFAULT_STACK;
      if (!Number.isInteger(stack) || stack < 1 || stack > STACK_MAX) throw new HttpError(422, { stack: FIELD_ERRORS.stackRange });
      const me = ensureSession(req, res, env);
      let t: TableRunner;
      try { t = registry.create(me.id, name, stack); } catch (e) {
        app.log("new-game persistence failure", e);
        throw new HttpError(503, { code: e instanceof PersistenceError ? "persistence-failed" : "server-error" });
      }
      const out: NewGameResponse = { gameID: t.id, playerID: me.id, isNetworkPlayer: false, playerUsername: name };
      return send(res, 200, out);
    }

    const m = path.match(/^\/games\/([^/]+)\/([a-z_-]+)$/);
    if (!m) throw new HttpError(404, "Not found");
    const me = need(req);
    const t = table(m[1]!);
    const body = await readJson(req);
    const run = (cmd: EngineCommand): ExecResult => t.exec(me.id, cmd);
    const done = (r: ExecResult, shape?: "errors" | "value" | "message"): void => (r.ok ? toText(res) : failure(res, r, shape));

    switch (m[2]) {
      case "request_ingress": {
        const b = parse(requestIngressSchema, body);
        return done(run({ kind: "requestIngress", body: { seat: b.seat, playerName: b.playerName, allowSpectator: b.allowSpectator, stack: b.stack, ...(b.sitAsAway ? { sitAsAway: true } : {}) } }));
      }
      case "approve_player": {
        owner(t, me);
        const b = parse(playerIdSchema.extend({ stack: z.number().finite().optional() }), body);
        return done(run({ kind: "approvePlayer", playerID: b.playerID, ...(b.stack !== undefined ? { stack: b.stack } : {}) }));
      }
      case "reject_player": owner(t, me); return done(run({ kind: "rejectPlayer", playerID: parse(playerIdSchema, body).playerID }));
      case "remove_player": {
        owner(t, me);
        const r = run({ kind: "removePlayer", playerID: parse(playerIdSchema, body).playerID });
        if (!r.ok) return failure(res, r);
        return send(res, 200, { queued: r.queued === true });
      }
      case "transfer_ownership": owner(t, me); return done(run({ kind: "transferOwnership", playerID: parse(playerIdSchema, body).playerID }));
      case "put_in_away_mode": owner(t, me); return done(run({ kind: "putInAway", playerID: parse(playerIdSchema, body).playerID }));
      case "toggle_god_mode": {
        owner(t, me);
        const b = parse(playerIdSchema.extend({ allow: z.boolean() }), body);
        return done(run({ kind: "toggleGodMode", playerID: b.playerID, allow: b.allow }));
      }
      case "update_player": {
        owner(t, me);
        const b = parse(playerIdSchema.extend({ stackChange: z.number().finite(), stackChangeMode: z.enum(["ADD", "REMOVE", "SET"]) }), body);
        const before = frameOf(t, me.id).players[b.playerID]?.stack;
        const r = run({ kind: "updatePlayer", playerID: b.playerID, stackChange: b.stackChange, stackChangeMode: b.stackChangeMode });
        if (!r.ok) return failure(res, r);
        const explicit = r.queued;
        const after = frameOf(t, me.id).players[b.playerID]?.stack;
        return send(res, 200, { queued: typeof explicit === "boolean" ? explicit : b.stackChange !== 0 && before === after });
      }
      case "update_game": {
        owner(t, me);
        if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, { code: "bad-request" });
        const r = run({ kind: "updateGame", config: body as ReturnType<typeof defaultGameConfig> });
        if (!r.ok) return failure(res, r);
        return send(res, 200, { queued: typeof r.queued === "boolean" ? r.queued : frameOf(t, me.id).table.configQueued });
      }
      case "start-game": owner(t, me); return done(run({ kind: "startGame" }), "value");
      case "request_rebuy": {
        const b = parse(z.object({ value: z.number().finite() }), body);
        return done(run({ kind: "requestRebuy", value: b.value }), "message");
      }
      case "resolve_rebuy": {
        owner(t, me);
        const b = parse(playerIdSchema.extend({ approve: z.boolean(), stack: z.number().finite().optional() }), body);
        return done(run({ kind: "resolveRebuy", playerID: b.playerID, approve: b.approve, ...(b.stack !== undefined ? { stack: b.stack } : {}) }), "message");
      }
      default: throw new HttpError(404, "Not found");
    }
  }

  return (req, res) => {
    const host = requestHost(req, env);
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "same-origin");
    if (env.isProd) res.setHeader("strict-transport-security", "max-age=15552000"); // SECURITY (Phase C): pin https in browsers
    res.setHeader("content-security-policy", contentSecurityPolicy(host, env));
    let url: URL;
    try { url = new URL(req.url ?? "/", "http://x"); } catch { return send(res, 400, "Bad request"); }
    route(req, res, url).catch((e: unknown) => {
      if (e instanceof HttpError) return send(res, e.status, e.body);
      app.log(`[http] ${req.method} ${url.pathname} failed`, e);
      send(res, 500, { code: "server-error" });
    });
  };
}

function ledgerCsv(engine: EngineApi, t: TableRunner): string {
  // U-N3: ledger CSV columns are a placeholder (SPEC 15.3: nickname, id, session start/end, buy-in, buy-out, stack, net)
  const led = engine.ledger(t.state);
  const rows = [csvRow(["player_nickname", "player_id", "session_start_hand", "session_end_hand", "buy_in", "buy_out", "stack", "net"])];
  for (const info of Object.values(led.playersInfos)) {
    const sessions = engine.ledgerSessions(t.state, info.id);
    if (sessions.length === 0) rows.push(csvRow([info.name, info.id, "", "", info.buyInSum, info.buyOutSum, info.inGame, info.net]));
    for (const s of sessions) rows.push(csvRow([info.name, info.id, s.start_hand_number ?? "", s.finish_hand_number ?? "", s.buy_in, s.buy_out, info.inGame, info.net]));
  }
  return rows.join("\n") + "\n";
}
