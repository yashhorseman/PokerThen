/**
 * Fake EngineApi for server development/tests (frozen contract: shared/engineApi.ts). NOT poker rules: a tiny state machine that
 * exercises every server path: ingress/approve/reject, config queueing, a hand with deterministic-shuffle commit, per-viewer
 * hole-card projection (ARCH 5.4), showdown/fold-win, reveal of exposed cards only (FAIRNESS-MERKLE), timers, presence, resume.
 */
import {
  CANONICAL_DECK, FIELD_ERRORS, GENESIS_PREV_COMMITMENT, PLACEHOLDERS, commitDeck, defaultGameConfig, revealCard,
  type CardCode, type CardSlot, type CommandResult, type EngineApi, type EngineCommand, type EngineCtx, type EngineEffect, type Entropy,
  type Frame, type GameConfig, type HandPlayerCards, type PlayerId, type PlayerInfo, type TableState, type FairnessUsage
} from "@pokerthen/shared";

interface FPlayer { id: string; name: string; status: PlayerInfo["status"]; stack: number; intendedSeat?: number; requestedStack?: number; away?: boolean; disconnectedSince?: number; muted: string[]; allowSpectator?: boolean }
interface FHand {
  handId: string; deck: CardCode[]; masterSalt: string; commitment: string; root: string; prev: string;
  inHand: string[]; holeIdx: Record<string, [number, number]>; folded: string[]; board: CardCode[]; boardIdx: number[]; burnIdx: number[];
  street: 0 | 1 | 2 | 3; toAct: number; acted: number; shown: string[]; phase: "betting" | "result"; resultAt: number | null; usage: FairnessUsage[]; cursor: number;
}
interface FState {
  gameId: string; ownerId: string; config: GameConfig; queued: GameConfig | null; players: Record<string, FPlayer>; seats: Array<[number, string]>;
  handNumber: number; status: "waiting" | "inProgress"; hand: FHand | null; prevCommitment: string; wakeAt: number | null; counter: number; paused: boolean;
}
const S = (s: TableState): FState => s as unknown as FState;
const wrap = (s: FState): TableState => s as unknown as TableState;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const hex = (u: Uint8Array): string => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const rid = (e: Entropy, n: number): string => { const a = "abcdefghijklmnopqrstuvwxyz"; const b = e(n); return [...b].map((x) => a[x % 26]).join(""); };

function uniform(e: Entropy, n: number): number {
  const limit = Math.floor(2 ** 32 / n) * n;
  for (;;) { const b = e(4); const u = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0; if (u < limit) return u % n; }
}
function shuffle(e: Entropy): CardCode[] {
  const d = [...CANONICAL_DECK];
  for (let i = 51; i >= 1; i--) { const j = uniform(e, i + 1); [d[i], d[j]] = [d[j]!, d[i]!]; }
  return d;
}

const fail = (status: 400 | 403 | 422, extra: { errors?: Record<string, string>; value?: string; code?: string } = {}): CommandResult => ({ ok: false, status, ...extra });
const log = (st: FState, now: number, msg: string, onlyFor?: string): EngineEffect => ({ kind: "log", handNumber: st.handNumber, msg, atMs: now, ...(onlyFor ? { onlyFor } : {}) });
const nm = (p: FPlayer): string => `"${p.name} @ ${p.id}"`;

/** mutable so tests can shorten the result windows */
export const fakeTiming = { fold: 3000, showdown: 6000 };

function startHand(st: FState, now: number, ctx: EngineCtx, fx: EngineEffect[]): void {
  const ids = st.seats.filter(([, id]) => st.players[id]!.status === "inGame" && !st.players[id]!.away).map(([, id]) => id);
  if (ids.length < 2) { st.status = "waiting"; st.hand = null; st.wakeAt = null; return; }
  if (st.queued) { st.config = st.queued; st.queued = null; }
  for (const p of Object.values(st.players)) if (p.status === "waitingNextGameToEnter") p.status = "inGame";
  st.handNumber++;
  st.status = "inProgress";
  const deck = shuffle(ctx.entropy);
  const masterSalt = hex(ctx.entropy(32));
  const handId = rid(ctx.entropy, 12);
  const c = commitDeck({ gameId: st.gameId, handNumber: st.handNumber, handId, prevCommitment: st.prevCommitment, deck, masterSalt });
  const holeIdx: Record<string, [number, number]> = {};
  ids.forEach((id, k) => { holeIdx[id] = [k, ids.length + k]; });
  const usage: FairnessUsage[] = [0, 1].flatMap((rd) => ids.map((id) => ({ kind: "hole" as const, run: 1 as const, street: 0 as const, playerId: id, indices: [holeIdx[id]![rd]!] })));
  st.hand = {
    handId, deck, masterSalt, commitment: c.commitment, root: c.root, prev: st.prevCommitment, inHand: ids, holeIdx, folded: [], board: [], boardIdx: [], burnIdx: [],
    street: 0, toAct: 0, acted: 0, shown: [], phase: "betting", resultAt: null, usage, cursor: 2 * ids.length
  };
  fx.push(log(st, now, `-- starting hand #${st.handNumber} (id: ${handId})  No Limit Texas Hold'em (dealer: ${nm(st.players[ids[0]!]!)}) --`));
  fx.push({ kind: "commit", gameId: st.gameId, handNumber: st.handNumber, handId, commitment: c.commitment, prevCommitment: st.prevCommitment, root: c.root, committedAtMs: now });
  fx.push(log(st, now, `Hand commitment (SHA-256): ${c.commitment}`));
  for (const id of ids) fx.push(log(st, now, `Your hand is ${deck[holeIdx[id]![0]]}, ${deck[holeIdx[id]![1]]}`, id));
  st.prevCommitment = c.commitment;
  st.wakeAt = null;
}

function finish(st: FState, now: number, shownIds: string[], fx: EngineEffect[]): void {
  const h = st.hand!;
  h.phase = "result";
  h.shown = shownIds;
  h.resultAt = now + (shownIds.length ? fakeTiming.showdown : fakeTiming.fold);
  st.wakeAt = h.resultAt;
  const winner = h.inHand.find((i) => !h.folded.includes(i));
  fx.push(log(st, now, shownIds.length ? `-- ending hand #${st.handNumber} --` : `${nm(st.players[winner!]!)} collected 0 from pot`));
}

function advance(st: FState, now: number, fx: EngineEffect[]): void {
  const h = st.hand!;
  const active = h.inHand.filter((i) => !h.folded.includes(i));
  if (active.length === 1) return finish(st, now, [], fx);
  if (h.acted >= active.length) {
    h.acted = 0;
    if (h.street === 3) return finish(st, now, active, fx);
    h.street = (h.street + 1) as 1 | 2 | 3;
    const n = h.street === 1 ? 3 : 1;
    h.burnIdx.push(h.cursor); h.usage.push({ kind: "burn", run: 1, street: h.street, indices: [h.cursor++] });
    const idx: number[] = [];
    for (let k = 0; k < n; k++) { idx.push(h.cursor); h.board.push(h.deck[h.cursor]!); h.boardIdx.push(h.cursor++); }
    h.usage.push({ kind: "board", run: 1, street: h.street, indices: idx });
    fx.push(log(st, now, `${["", "Flop", "Turn", "River"][h.street]}: ${h.board.join(", ")}`));
  }
  do { h.toAct = (h.toAct + 1) % h.inHand.length; } while (h.folded.includes(h.inHand[h.toAct]!));
}

function revealEffect(st: FState, now: number): EngineEffect {
  const h = st.hand!;
  const exposed = new Set<number>(h.boardIdx);
  for (const id of h.shown) for (const ix of h.holeIdx[id]!) exposed.add(ix);
  const c = commitDeck({ gameId: st.gameId, handNumber: st.handNumber, handId: h.handId, prevCommitment: h.prev, deck: h.deck, masterSalt: h.masterSalt });
  const cards = [...exposed].sort((a, b) => a - b).map((ix) => revealCard(c, h.deck, h.masterSalt, ix));
  return {
    kind: "reveal",
    reveal: {
      gameId: st.gameId, handNumber: st.handNumber, handId: h.handId, commitment: h.commitment, prevCommitment: h.prev, root: h.root,
      dealOrder: h.inHand, usage: h.usage, cards, revealedAtMs: now
    }
  };
}

function ok(st: FState, effects: EngineEffect[] = []): CommandResult { return { ok: true, state: wrap(st), effects }; }

function validateName(st: FState, name: string, except?: string): string | null {
  const n = name.trim();
  if ([...n].length < 2 || [...n].length > 14) return FIELD_ERRORS.nameInvalid;
  if (Object.values(st.players).some((p) => p.id !== except && p.name.toLowerCase() === n.toLowerCase())) return FIELD_ERRORS.nameTaken;
  return null;
}

export const fakeEngine: EngineApi = {
  createTable(p, ctx) {
    const st: FState = {
      gameId: p.gameId, ownerId: p.ownerId, config: defaultGameConfig(p.sb, p.bb), queued: null,
      players: { [p.ownerId]: { id: p.ownerId, name: p.ownerName.trim(), status: "inGame", stack: p.stack, muted: [] } }, seats: [[1, p.ownerId]],
      handNumber: 0, status: "waiting", hand: null, prevCommitment: GENESIS_PREV_COMMITMENT, wakeAt: null, counter: 0, paused: false
    };
    return { state: wrap(st), effects: [log(st, ctx.now, `The game was created by ${nm(st.players[p.ownerId]!)}.`)] };
  },

  command(state0, actor, cmd: EngineCommand, ctx) {
    const st = clone(S(state0));
    const fx: EngineEffect[] = [];
    const isOwner = actor === st.ownerId;
    switch (cmd.kind) {
      case "requestIngress": {
        const b = cmd.body;
        const errors: Record<string, string> = {};
        const ne = validateName(st, b.playerName, actor);
        if (ne) errors.playerName = ne;
        const sv = b.stack;
        if (sv === null || !Number.isInteger(sv) || sv < 1 || sv > 1_000_000) errors.stack = FIELD_ERRORS.stackRange;
        if (Object.keys(errors).length) return fail(422, { errors });
        if (st.players[actor] && st.players[actor]!.status !== "watching" && st.players[actor]!.status !== "requestedGameIngress") return fail(422, { errors: { playerName: FIELD_ERRORS.nameTaken } });
        st.players[actor] = { id: actor, name: b.playerName.trim(), status: "requestedGameIngress", stack: 0, intendedSeat: b.seat, requestedStack: sv!, muted: [], allowSpectator: b.allowSpectator, ...(b.sitAsAway ? { away: true } : {}) };
        return ok(st);
      }
      case "approvePlayer": {
        if (!isOwner) return fail(403, { code: "not_owner" });
        const p = st.players[cmd.playerID];
        if (!p || p.status !== "requestedGameIngress") return fail(422, { value: "no such request" });
        const taken = new Set(st.seats.map(([s]) => s));
        let seat = p.intendedSeat && !taken.has(p.intendedSeat) ? p.intendedSeat : 0;
        for (let i = 1; !seat && i <= 10; i++) if (!taken.has(i)) seat = i;
        if (!seat) return fail(422, { value: "table full" });
        p.stack = cmd.stack ?? p.requestedStack ?? 1000;
        p.status = st.hand ? "waitingNextGameToEnter" : "inGame";
        st.seats.push([seat, p.id]);
        fx.push({ kind: "notice", to: p.id, code: "approved" });
        fx.push(log(st, ctx.now, `The player ${nm(p)} joined the game with a stack of ${p.stack}.`));
        return ok(st, fx);
      }
      case "rejectPlayer": {
        if (!isOwner) return fail(403, { code: "not_owner" });
        if (!st.players[cmd.playerID]) return fail(422, { value: "no such player" });
        delete st.players[cmd.playerID];
        fx.push({ kind: "notice", to: cmd.playerID, code: "rejected" });
        return ok(st, fx);
      }
      case "removePlayer": {
        if (!isOwner) return fail(403, { code: "not_owner" });
        const p = st.players[cmd.playerID];
        if (!p || p.id === st.ownerId) return fail(422, { value: "cannot remove" });
        st.seats = st.seats.filter(([, i]) => i !== p.id);
        p.status = "watching"; p.stack = 0;
        fx.push({ kind: "notice", to: p.id, code: "removed" });
        return ok(st, fx);
      }
      case "transferOwnership": {
        if (!isOwner) return fail(403, { code: "not_owner" });
        if (!st.players[cmd.playerID]) return fail(422, { value: "no such player" });
        st.ownerId = cmd.playerID;
        fx.push({ kind: "notice", to: cmd.playerID, code: "ownershipTransferred" });
        return ok(st, fx);
      }
      case "putInAway": { if (!isOwner) return fail(403); const p = st.players[cmd.playerID]; if (p) p.away = true; return ok(st); }
      case "toggleGodMode": return isOwner ? ok(st) : fail(403, { code: "not_owner" });
      case "updatePlayer": {
        if (!isOwner) return fail(403, { code: "not_owner" });
        const p = st.players[cmd.playerID];
        if (!p) return fail(422, { value: "no such player" });
        if (st.hand && st.hand.inHand.includes(p.id)) return ok(st); // queued (frame stack unchanged)
        p.stack = cmd.stackChangeMode === "SET" ? cmd.stackChange : cmd.stackChangeMode === "ADD" ? p.stack + cmd.stackChange : Math.max(0, p.stack - cmd.stackChange);
        return ok(st);
      }
      case "updateGame": {
        if (!isOwner) return fail(403, { code: "not_owner" });
        const c = cmd.config;
        if (!c || !Array.isArray(c.blindLevels) || !c.blindLevels.length) return fail(422, { errors: { blindLevels: PLACEHOLDERS.FIELD_ERROR } });
        if (st.hand) st.queued = c; else st.config = c;
        return ok(st);
      }
      case "startGame": {
        if (!isOwner) return fail(403, { code: "not_owner" });
        if (st.status !== "waiting") return fail(422, { value: "already started" });
        startHand(st, ctx.now, ctx, fx);
        if (!st.hand) return fail(422, { value: PLACEHOLDERS.START_GAME_ERROR });
        return ok(st, fx);
      }
      case "requestRebuy": return fail(422, { value: "rebuy not available" });
      case "resolveRebuy": return fail(422, { value: "rebuy not available" });
      case "presence": {
        const p = st.players[actor];
        if (!p) return ok(st);
        if (cmd.connected) delete p.disconnectedSince; else p.disconnectedSince = ctx.now;
        return ok(st);
      }
      case "resume": {
        if (st.wakeAt !== null) st.wakeAt += cmd.downtimeMs;
        if (st.hand?.resultAt) st.hand.resultAt += cmd.downtimeMs;
        return ok(st);
      }
      case "action": {
        const a = cmd.action;
        const h = st.hand;
        const me = st.players[actor];
        if (!me) return fail(403, { code: "unknown-player" });
        if (a.type === "TOGGLE_MUTE_PLAYER") {
          me.muted = me.muted.includes(a.otherPlayerID) ? me.muted.filter((x) => x !== a.otherPlayerID) : [...me.muted, a.otherPlayerID];
          return ok(st);
        }
        if (a.type === "SUNH") { me.away = true; return ok(st); }
        if (a.type === "PLAYER_SIT_BACK") { delete me.away; return ok(st); }
        if (a.type === "NH") {
          if (!isOwner || (h && h.phase !== "result")) return fail(403);
          startHand(st, ctx.now, ctx, fx);
          return ok(st, fx);
        }
        if (a.type === "SHOW_HAND") {
          if (!h || h.phase !== "result" || !h.inHand.includes(actor) || h.shown.includes(actor)) return fail(400);
          h.shown.push(actor);
          return ok(st);
        }
        if (a.type === "PLAYER_FOLD" || a.type === "PLAYER_CHECK" || a.type === "PLAYER_CALL" || a.type === "PLAYER_RAISE") {
          if (!h || h.phase !== "betting" || h.inHand[h.toAct] !== actor) return fail(400, { code: "not-your-turn" });
          if (a.type === "PLAYER_FOLD") { h.folded.push(actor); fx.push(log(st, ctx.now, `${nm(me)} folds`)); } else { h.acted++; fx.push(log(st, ctx.now, `${nm(me)} ${a.type === "PLAYER_CHECK" ? "checks" : "calls 0"}`)); }
          advance(st, ctx.now, fx);
          return ok(st, fx);
        }
        return ok(st);
      }
    }
  },

  tick(state0, ctx) {
    const s0 = S(state0);
    if (s0.wakeAt === null || ctx.now < s0.wakeAt || s0.paused) return { ok: true, state: state0, effects: [] };
    const st = clone(s0);
    const fx: EngineEffect[] = [];
    if (st.hand && st.hand.phase === "result") {
      fx.push(revealEffect(st, ctx.now));
      fx.push(log(st, ctx.now, `Hand reveal published (hand #${st.handNumber}).`));
      startHand(st, ctx.now, ctx, fx);
      if (!st.hand) st.wakeAt = null;
    } else st.wakeAt = null;
    return ok(st, fx);
  },

  nextWakeAt: (s) => S(s).wakeAt,

  frame(state, viewer, now): Frame {
    const st = S(state);
    const h = st.hand;
    const players: Frame["players"] = {};
    for (const p of Object.values(st.players)) {
      players[p.id] = { id: p.id, name: p.name, status: p.status, stack: p.stack, winCount: 0, quitCount: 0, ...(p.intendedSeat ? { intendedSeat: p.intendedSeat } : {}), ...(p.requestedStack ? { requestedStack: p.requestedStack } : {}), ...(p.away ? { away: true } : {}), ...(p.disconnectedSince ? { disconnectedSince: p.disconnectedSince } : {}) };
    }
    const cards: Frame["cards"] = {};
    if (h) {
      for (const id of h.inHand) {
        const folded = h.folded.includes(id);
        const showing = h.shown.includes(id);
        const slots: CardSlot[] = h.holeIdx[id]!.map((ix) => {
          if (showing) return { value: h.deck[ix]!, showing: true };
          if (id === viewer) return { value: h.deck[ix]!, showing: false };
          return { value: null, showing: false };
        });
        const hp: HandPlayerCards = { cards: folded && !showing ? [] : slots };
        cards[id] = hp;
      }
    }
    const mine = viewer ? st.players[viewer] : undefined;
    const frame: Frame = {
      meta: { id: st.gameId, now, pre: now, sN: now, version: "fake", mEV: 0 },
      table: {
        status: st.status, ownerId: st.ownerId, pausedAt: null, stopQueued: false, handNumber: st.handNumber, configQueued: st.queued !== null,
        config: st.config, nextBlindAt: null, nextBlind: null, spectatorMode: st.config.spectatorMode, godModeIds: [], waitingMessage: null,
        blinds: { sb: st.config.blindLevels[0]!.sb, bb: st.config.blindLevels[0]!.bb, ante: null, level: 1 }, spectatorCount: 0
      },
      seats: st.seats,
      players,
      hand: h && {
        handNumber: st.handNumber, handId: h.handId, commitment: h.commitment, dealerSeat: 1, deadButton: false, dealerId: h.inHand[0] ?? null, smallBlindId: null, bigBlindId: null, straddleId: null,
        inHandIds: h.inHand, playerStatus: Object.fromEntries(h.inHand.map((i) => [i, h.folded.includes(i) ? "fold" : "inGame"])) as never,
        street: { run: 1, stage: h.phase === "result" ? 5 : h.street }, runs: 1, board: { "1": h.board }, pot: 0, bets: {}, highestBet: 0, minRaise: 0, maxBet: null,
        optionIds: [], noReraiseIds: [], bigBlindChecked: false, directToNext: false, winningBoardCards: null
      },
      turn: {
        playerId: h && h.phase === "betting" ? h.inHand[h.toAct]! : null, taking: h && h.phase === "betting" ? h.inHand[h.toAct]! : null, actionStartedAt: null, deadlineNoBank: null,
        deadlineWithBank: null, nextStep: h?.phase === "result" ? "NSAGR" : h ? "FCPFS" : null, nextStepAt: h?.resultAt ?? null, bankMs: {}, ritWaiting: false, ritVotes: {}, rebuyPromptIds: []
      },
      cards,
      result: null,
      rabbit: { enabled: false, hunters: [], cards: null },
      ...(viewer ? { you: { id: viewer, name: mine?.name ?? "", mutedIds: mine?.muted ?? [], straddling: false, isOwner: viewer === st.ownerId } } : {})
    };
    return frame;
  },

  playerName: (s, id) => S(s).players[id]?.name ?? null,
  isOwner: (s, id) => S(s).ownerId === id,
  mutedIds: (s, id) => S(s).players[id]?.muted ?? [],
  ledger(s) {
    const st = S(s);
    const infos: Record<string, import("@pokerthen/shared").LedgerPlayerInfo> = {};
    let inTot = 0, stackTot = 0;
    for (const p of Object.values(st.players)) {
      if (p.status === "requestedGameIngress" || p.status === "watching") continue;
      infos[p.id] = { id: p.id, name: p.name, buyInSum: 1000, buyOutSum: 0, inGame: p.stack, nitEscrow: 0, net: p.stack - 1000 };
      inTot += 1000; stackTot += p.stack;
    }
    return { playersInfos: infos, buyInTotal: inTot, buyOutTotal: 0, inGameTotal: stackTot, nitEscrowTotal: 0, gameHasRake: false, rakedValue: 0, rakedValueWaitingToBeCollected: 0 };
  },
  currentOrNextConfig: (s) => ({ ...(S(s).queued ?? S(s).config), queued: S(s).queued !== null }),
  playerEdit: (s, id) => (S(s).players[id] ? ({ player: { id, name: S(s).players[id]!.name, status: "inGame", stack: S(s).players[id]!.stack, winCount: 0, quitCount: 0 }, enqueuedChanges: [] } as never) : null),
  ledgerSessions: (s, id) => (S(s).players[id] ? [{ id: "s1", status: "playing", buy_in: 1000, buy_out: 0, start_hand_number: 1, finish_hand_number: null, movements: [{ kind: "tookSeat", value: 1000 }] }] : []),
  _debugDeck: (s) => S(s).hand?.deck ?? null
};
