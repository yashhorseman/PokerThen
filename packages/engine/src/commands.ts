/** EngineApi command/tick/createTable. Each call clones the state, mutates the clone and returns it (failed commands never change state). */
import { FIELD_ERRORS, PLACEHOLDERS, STACK_MAX, defaultGameConfig, type CommandResult, type EngineApi, type EngineCommand, type EngineCtx, type EngineEffect, type FieldErrors, type GameConfig, type TableState } from "@pokerthen/shared";
import { activateBank, act, autoIfActor, applyConfig, beginHand, eligibleCount, leaveSeat, rabbitReveal, requestNextHand, rebuyDecline, rebuyRequest, rebuyResolve, ritVote, shiftTimes, showCards, tickAll, wakeAt } from "./hand/flow.js";
import { L } from "./logText.js";
import { GUEST_NAME, MAX_NAME, MIN_NAME } from "./placeholders.js";
import { shuffleArray } from "./rng.js";
import { asS, asT, handRunning, log, raw, seatedIds, type Env, type PlayerRec, type S } from "./state.js";
import { normaliseConfig, validateConfig } from "./table/config.js";
import { adjustStack, openSession } from "./table/ledger.js";

type Fail = { ok: false; status: 400 | 403 | 422; errors?: FieldErrors; value?: string; code?: string; message?: string };
const fail = (status: 400 | 403 | 422, extra: Partial<Fail> = {}): Fail => ({ ok: false, status, ...extra });

export function newPlayer(s: S, id: string, name = GUEST_NAME): PlayerRec {
  const p: PlayerRec = {
    id, name, status: "watching", stack: 0, winCount: 0, quitCount: 0, seat: null, allowSpectator: false, away: false, quitNextHand: false, removeQueued: false,
    disconnectedSince: null, rebuyCount: 0, emoji: null, straddling: false, muted: [], bankMs: (s.config.timeBankSec ?? 0) * 1000, missedSB: false, entered: false, queued: [], sessions: []
  };
  s.players[id] = p; s.order.push(id);
  return p;
}

export function createTable(p: Parameters<EngineApi["createTable"]>[0], ctx: EngineCtx): { state: TableState; effects: EngineEffect[] } {
  const s: S = {
    v: 1, gameId: p.gameId, ownerId: p.ownerId, createdAt: ctx.now, status: "waiting", handNumber: 0, players: {}, order: [],
    config: defaultGameConfig(p.sb, p.bb), queuedConfig: null, stopQueued: false, pausedAt: null, godModeIds: [], buttonSeat: null,
    prevCommitment: "0".repeat(64), blindLevel: 0, blindClockAt: null, lastAnte: 0, hand: null, rebuy: null, ritReveal: false, sessionSeq: 0
  };
  const o = newPlayer(s, p.ownerId, p.ownerName.trim());
  o.status = "inGame"; o.seat = 1; o.stack = p.stack; openSession(s, o, p.stack);
  return { state: asT(s), effects: [] };
}

const validStack = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= STACK_MAX;
const nameKey = (n: string) => n.trim().toLowerCase();

export function command(state: TableState, actor: string, cmd: EngineCommand, ctx: EngineCtx): CommandResult {
  const s = structuredClone(asS(state));
  queuedFlag = undefined;
  const env: Env = { now: ctx.now, entropy: ctx.entropy, fx: [] };
  const r = run(s, env, actor, cmd);
  if (r) return r;
  return withMeta({ ok: true, state: asT(s), effects: env.fx }, queuedFlag);
}

let queuedFlag: boolean | undefined;
function withMeta(r: CommandResult, q: boolean | undefined): CommandResult {
  if (r.ok && q !== undefined) (r as { queued?: boolean }).queued = q;
  queuedFlag = undefined;
  return r;
}

/** Seat a player that holds a pending request (shared by owner approval and the owner's own `Take the Seat`). */
function seatRequester(s: S, p: PlayerRec, stack: number): void {
  p.seat = p.intendedSeat!; p.stack = stack; delete p.intendedSeat; delete p.requestedStack;
  p.status = handRunning(s) ? "waitingNextGameToEnter" : "inGame"; p.entered = false;
  p.bankMs = (s.config.timeBankSec ?? 0) * 1000;
  if (p.sitAsAway) { p.away = true; p.status = "standingUp"; }
  openSession(s, p, stack);
}

function run(s: S, env: Env, actor: string, cmd: EngineCommand): Fail | null {
  const isOwner = actor === s.ownerId;
  const me = s.players[actor];
  const owner = () => (isOwner ? null : fail(403));
  switch (cmd.kind) {
    case "presence": {
      const p = me ?? (cmd.connected && actor !== "system" ? newPlayer(s, actor) : null);
      if (!p) return null;
      p.disconnectedSince = cmd.connected ? null : env.now;
      // SECURITY (Phase C): a pure watcher record is created for every token that ever connects; drop it again when the socket goes away
      // (never the owner, a god-mode spectator, or anyone with ledger history), otherwise throw-away tokens grow the persisted state without bound.
      if (!cmd.connected && p.seat === null && p.status === "watching" && p.id !== s.ownerId && p.sessions.length === 0 && !s.godModeIds.includes(p.id)) {
        delete s.players[p.id]; s.order = s.order.filter((x) => x !== p.id);
      }
      return null;
    }
    case "resume": {
      if (cmd.downtimeMs > 0) { shiftTimes(s, cmd.downtimeMs); if (s.pausedAt !== null) s.pausedAt += cmd.downtimeMs; }
      return null;
    }
    case "requestIngress": {
      if (!me) return fail(403, { code: "missing_game_player" });
      if (me.seat !== null || me.status === "requestedGameIngress") return fail(400);
      if (Object.values(s.players).filter((p) => p.status === "requestedGameIngress").length >= 30) return fail(400, { code: "too_many_requests" }); // SECURITY: bound pending requests
      const b = cmd.body; const errors: FieldErrors = {};
      const name = String(b.playerName ?? "").trim();
      const taken = Object.values(s.players).some((p) => p.id !== actor && p.name !== GUEST_NAME && nameKey(p.name) === nameKey(name));
      if (name.length < MIN_NAME || name.length > MAX_NAME) errors.playerName = FIELD_ERRORS.nameInvalid;
      else if (taken) errors.playerName = FIELD_ERRORS.nameTaken;
      if (!validStack(b.stack)) errors.stack = FIELD_ERRORS.stackRange;
      if (Object.keys(errors).length) return fail(422, { errors });
      if (!Number.isInteger(b.seat) || b.seat < 1 || b.seat > 10 || seatedIds(s).some((id) => s.players[id]!.seat === b.seat)) return fail(422, { errors: { seat: PLACEHOLDERS.FIELD_ERROR } });
      me.name = name; me.status = "requestedGameIngress"; me.intendedSeat = b.seat; me.requestedStack = b.stack as number;
      me.sitAsAway = !!b.sitAsAway; me.allowSpectator = !!b.allowSpectator;
      // SPEC 2.3 `Take the Seat`: the OWNER takes the seat directly - no pending request, no self-approval dialog, no request/approval log lines
      // (reference logs only the generic "joined the game" line for an entrant; the log wording for an owner re-sit is otherwise unobserved, U-LOG1).
      if (isOwner) { seatRequester(s, me, me.requestedStack as number); return null; }
      log(env, s, L.requestedSeat(raw(s, actor)));
      return null;
    }
    case "approvePlayer": {
      const o = owner(); if (o) return o;
      const p = s.players[cmd.playerID];
      if (!p || p.status !== "requestedGameIngress") return fail(400);
      const stack = cmd.stack ?? p.requestedStack;
      if (!validStack(stack)) return fail(422, { errors: { stack: FIELD_ERRORS.stackRange } });
      if (seatedIds(s).some((id) => s.players[id]!.seat === p.intendedSeat)) return fail(422, { errors: { seat: PLACEHOLDERS.FIELD_ERROR } });
      seatRequester(s, p, stack);
      log(env, s, L.approved(raw(s, p.id), stack));
      env.fx.push({ kind: "notice", to: p.id, code: "approved" });
      return null;
    }
    case "rejectPlayer": {
      const o = owner(); if (o) return o;
      const p = s.players[cmd.playerID];
      if (!p || p.status !== "requestedGameIngress") return fail(400);
      clearRequest(p);
      env.fx.push({ kind: "notice", to: p.id, code: "rejected" });
      return null;
    }
    case "updatePlayer": {
      const o = owner(); if (o) return o;
      const p = s.players[cmd.playerID];
      if (!p || p.seat === null) return fail(400);
      const v = cmd.stackChange;
      if (!Number.isInteger(v) || v < 0 || v > 1_000_000_000 || (cmd.stackChangeMode === "ADD" && v < 1)) return fail(422, { errors: { stackChange: PLACEHOLDERS.FIELD_ERROR } });
      if (cmd.stackChangeMode === "REMOVE" && v > p.stack) return fail(422, { errors: { stackChange: PLACEHOLDERS.FIELD_ERROR } });
      if (s.status === "waiting" || p.status === "standingUp") {
        const old = p.stack;
        p.stack = cmd.stackChangeMode === "ADD" ? old + v : cmd.stackChangeMode === "REMOVE" ? old - v : v;
        adjustStack(p, cmd.stackChangeMode, old, p.stack);
        log(env, s, L.stackUpdated(raw(s, p.id), old, p.stack));
        queuedFlag = false;
      } else {
        p.queued.push({ kind: "update", mode: cmd.stackChangeMode, value: v });
        log(env, s, L.stackQueued(raw(s, p.id), cmd.stackChangeMode, v));
        queuedFlag = true;
      }
      return null;
    }
    case "removePlayer": {
      const o = owner(); if (o) return o;
      const p = s.players[cmd.playerID];
      if (!p || p.seat === null || p.id === actor) return fail(400);
      log(env, s, L.removalQueued(raw(s, actor), raw(s, p.id)));
      const inHand = handRunning(s) && s.hand!.participants.includes(p.id);
      if (inHand) { p.removeQueued = true; queuedFlag = true; autoIfActor(env, s, p.id); }
      else { queuedFlag = false; if (s.rebuy?.ids.includes(p.id)) { rebuyDecline(env, s, p.id); } else leaveSeat(env, s, p.id); }
      env.fx.push({ kind: "notice", to: p.id, code: "removed" });
      return null;
    }
    case "transferOwnership": {
      const o = owner(); if (o) return o;
      const p = s.players[cmd.playerID];
      if (!p || p.id === actor) return fail(400);
      s.ownerId = p.id; // U-LOG1: no log line observed for ownership transfer
      env.fx.push({ kind: "notice", to: p.id, code: "ownershipTransferred" });
      return null;
    }
    case "putInAway": {
      const o = owner(); if (o) return o;
      const p = s.players[cmd.playerID];
      if (!p || p.seat === null || p.id === actor || p.status !== "inGame") return fail(400);
      goAway(env, s, p);
      return null;
    }
    case "toggleGodMode": {
      const o = owner(); if (o) return o;
      if (!s.players[cmd.playerID] || !s.config.spectatorMode) return fail(400);
      s.godModeIds = s.godModeIds.filter((x) => x !== cmd.playerID);
      if (cmd.allow) s.godModeIds.push(cmd.playerID);
      return null;
    }
    case "updateGame": {
      const o = owner(); if (o) return o;
      const cfg = normaliseConfig(cmd.config);
      const errors = validateConfig(s, cfg);
      if (errors) return fail(422, { errors });
      if (s.status === "waiting") { applyConfig(env, s, cfg); s.queuedConfig = null; queuedFlag = false; }
      else {
        s.queuedConfig = cfg; queuedFlag = true;
        applyConfig(env, s, cfg, ["straddleAllowed", "showdownTime"]); // live: these two apply to the running hand at once (08 i)
      }
      return null;
    }
    case "startGame": {
      const o = owner(); if (o) return o;
      if (s.status !== "waiting" || eligibleCount(s) < 2) return fail(422, { value: PLACEHOLDERS.START_GAME_ERROR });
      beginHand(env, s, true);
      return null;
    }
    case "requestRebuy": {
      if (!validStack(cmd.value)) return fail(422, { message: FIELD_ERRORS.stackRange });
      if (!rebuyRequest(env, s, actor, cmd.value)) return fail(400);
      return null;
    }
    case "resolveRebuy": {
      const o = owner(); if (o) return o;
      const req = s.rebuy?.requests[cmd.playerID];
      const stack = cmd.stack ?? req ?? 0;
      if (cmd.approve && !validStack(stack)) return fail(422, { message: FIELD_ERRORS.stackRange });
      if (!rebuyResolve(env, s, cmd.playerID, cmd.approve, stack)) return fail(400);
      return null;
    }
    case "action": return doAction(s, env, actor, cmd.action, me);
  }
}

function clearRequest(p: PlayerRec): void {
  p.status = "watching"; p.name = GUEST_NAME; delete p.intendedSeat; delete p.requestedStack; p.sitAsAway = false; p.allowSpectator = false;
}

function goAway(env: Env, s: S, p: PlayerRec): void {
  p.away = true;
  const inHand = handRunning(s) && s.hand!.participants.includes(p.id);
  if (inHand) autoIfActor(env, s, p.id);
  if (!inHand && !s.config.dealToAway && p.status === "inGame") {
    p.status = "standingUp"; p.entered = false;
    log(env, s, L.standUp(raw(s, p.id), p.stack));
  }
}

function doAction(s: S, env: Env, actor: string, a: import("@pokerthen/shared").ActionMsg, me: PlayerRec | undefined): Fail | null {
  const isOwner = actor === s.ownerId;
  const h = s.hand;
  if (!me) return a.type === "RUP" ? null : fail(403);
  const paused = s.pausedAt !== null;
  switch (a.type) {
    case "RUP": return null;
    case "PLAYER_FOLD": case "PLAYER_CHECK": case "PLAYER_CALL": case "PLAYER_RAISE":
      if (paused || !h || h.closed) return fail(400);
      return act(env, s, h, actor, a) ? null : fail(400);
    case "ATB": return !paused && h && !h.closed && activateBank(env, s, h, actor) ? null : fail(400);
    case "NH":
      if (!isOwner) return fail(403);
      if (!h || !h.closed || h.phase !== "idle" || s.rebuy || s.status !== "inProgress") return fail(400);
      requestNextHand(env, s); return null;
    case "RS": {
      if (!isOwner) return fail(403);
      if (s.status !== "waiting" || eligibleCount(s) < 2) return fail(400);
      const ids = seatedIds(s); const seats = ids.map((id) => s.players[id]!.seat!);
      shuffleArray(env.entropy, ids).forEach((id, i) => { s.players[id]!.seat = seats[i]!; });
      return null;
    }
    case "UP":
      if (!isOwner) return fail(403);
      if (paused || !h || h.closed) return fail(400);
      s.pausedAt = env.now; return null;
    case "UR":
      if (!isOwner) return fail(403);
      if (!paused) return fail(400);
      shiftTimes(s, env.now - s.pausedAt!); s.pausedAt = null; return null;
    case "TSG":
      if (!isOwner) return fail(403);
      if (!handRunning(s)) return fail(400);
      if (a.decision && !s.stopQueued) log(env, s, L.stopQueued(raw(s, actor)));
      s.stopQueued = a.decision; return null;
    case "SUNH":
      if (me.seat === null || me.away) return fail(400);
      goAway(env, s, me); return null;
    case "PLAYER_SIT_BACK": {
      if (me.seat === null || (!me.away && me.status !== "standingUp")) return fail(400);
      if (me.stack <= 0) return fail(400, { code: "sit_back_without_chips" });
      me.away = false;
      if (me.status === "standingUp") me.status = s.status === "inProgress" ? "waitingNextGameToEnter" : "inGame";
      return null;
    }
    case "QNH": {
      if (me.seat === null) return fail(400);
      if (s.rebuy?.ids.includes(actor)) return rebuyDecline(env, s, actor) ? null : fail(400);
      const inHand = handRunning(s) && s.hand!.participants.includes(actor);
      if (inHand) { me.quitNextHand = true; autoIfActor(env, s, actor); } else leaveSeat(env, s, actor);
      return null;
    }
    case "CQNH": me.quitNextHand = false; return null;
    case "CANCEL_REQUEST_GAME_INGRESS":
      if (me.status !== "requestedGameIngress") return fail(400);
      clearRequest(me); return null;
    case "DRITD": return h && !h.closed && ritVote(env, s, h, actor, a.decision) ? null : fail(400);
    case "SHOW_HAND": return h && h.holes[actor] && showCards(env, s, h, actor, a.cardToShow) ? null : fail(400);
    case "RUC": return h && rabbitReveal(env, s, h, actor) ? null : fail(400);
    case "SSP": me.straddling = a.value; return null;
    case "TOGGLE_MUTE_PLAYER":
      if (a.otherPlayerID === actor) return fail(400);
      me.muted = me.muted.includes(a.otherPlayerID) ? me.muted.filter((x) => x !== a.otherPlayerID) : [...me.muted, a.otherPlayerID];
      return null;
    case "ME":
      if (a.emoji !== null && !(PLACEHOLDERS.EMOJI as readonly string[]).includes(a.emoji)) return fail(400); // U-E1 placeholder list
      me.emoji = a.emoji; return null;
    default: return fail(400);
  }
}

export function tick(state: TableState, ctx: EngineCtx): CommandResult {
  const s = structuredClone(asS(state));
  const env: Env = { now: ctx.now, entropy: ctx.entropy, fx: [] };
  tickAll(env, s);
  return { ok: true, state: asT(s), effects: env.fx };
}

export const nextWakeAt = (state: TableState): number | null => wakeAt(asS(state));

