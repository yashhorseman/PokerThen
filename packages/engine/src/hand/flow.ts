/** Hand state machine: start, betting, streets, run-out, showdown/award, close, rebuy. All functions mutate the (already cloned) state. */
import { CANONICAL_DECK, GENESIS_PREV_COMMITMENT, T, type CardCode, type GameConfig, type FairnessUsage } from "@pokerthen/shared";
import { bestFive, scoreCodes } from "../eval/evaluate.js";
import { chipName, logName } from "../eval/names.js";
import { equity } from "../equity.js";
import { buildReveal, commitDeck } from "../fairness.js";
import { L, cards, configChanges } from "../logText.js";
import { ATB_GRACE_MS, REBUY_WINDOW_SEC, RIT_REVEAL_DELAY_MS, STRADDLE_BB } from "../placeholders.js";
import { newHandId, newSalt, shuffle, uniformInt } from "../rng.js";
import { allUsage, log, raw, seatedIds, type Env, type HandRec, type PlayerRec, type S } from "../state.js";
import { closeSession, curSession, markStarted, adjustStack, openSession } from "../table/ledger.js";
import { computePots, ringAfter, uncalled } from "./pots.js";

const ms = (sec: number) => sec * 1000;

/* ------------------------------------------------------------------ helpers */
export const nonFolded = (h: HandRec): string[] => h.participants.filter((id) => h.status[id] !== "fold");
export const ableIds = (h: HandRec): string[] => h.participants.filter((id) => h.status[id] === "inGame");
export const toCall = (h: HandRec, id: string): number => Math.max(0, h.highest - (h.bets[id] ?? 0));
export const stageOf = (h: HandRec): number => h.stage;

export function currentLevel(s: S) {
  const lv = s.config.blindLevels;
  return lv[Math.min(s.blindLevel, lv.length - 1)]!;
}
export const currentAnte = (s: S): number => (s.config.antes ? currentLevel(s).ante ?? 0 : 0);

function levelUpdate(env: Env, s: S): void {
  const c = s.config;
  if (c.blindResetLevel !== null) { s.blindLevel = Math.min(Math.max(c.blindResetLevel - 1, 0), c.blindLevels.length - 1); s.blindClockAt = env.now; c.blindResetLevel = null; }
  if (s.blindClockAt === null) s.blindClockAt = env.now;
  s.blindLevel = Math.min(s.blindLevel, c.blindLevels.length - 1);
  for (;;) {
    const lv = c.blindLevels[s.blindLevel]!;
    if (lv.durationMin === null || s.blindLevel >= c.blindLevels.length - 1) break;
    const end: number = (s.blindClockAt as number) + lv.durationMin * 60_000;
    if (env.now < end) break;
    s.blindClockAt = end; s.blindLevel++;
  }
}
export function nextBlindInfo(s: S): { at: number | null; next: { sb: number; bb: number; ante: number | null } | null } {
  const lv = currentLevel(s);
  if (lv.durationMin === null || s.blindLevel >= s.config.blindLevels.length - 1 || s.blindClockAt === null) return { at: null, next: null };
  const n = s.config.blindLevels[s.blindLevel + 1]!;
  return { at: s.blindClockAt + lv.durationMin * 60_000, next: { sb: n.sb, bb: n.bb, ante: s.config.antes ? n.ante : null } };
}

export function applyConfig(env: Env, s: S, next: GameConfig, only?: ReadonlyArray<keyof GameConfig>): void {
  const lines = configChanges(s.config, next, only);
  if (lines.length) log(env, s, ["Game Config Changes", ...lines].join("\n"));
  if (only) { const c = s.config as unknown as Record<string, unknown>; for (const k of only) c[k] = (next as unknown as Record<string, unknown>)[k]; }
  else s.config = JSON.parse(JSON.stringify(next)) as GameConfig;
  for (const p of Object.values(s.players)) {
    const bank = (s.config.timeBankSec ?? 0) * 1000;
    p.bankMs = Math.min(p.bankMs, bank);
  }
}

const isEligible = (s: S, p: PlayerRec): boolean =>
  p.seat !== null && p.stack > 0 && (p.status === "inGame" || p.status === "waitingNextGameToEnter") && (!p.away || s.config.dealToAway);

export function eligibleCount(s: S): number {
  return Object.values(s.players).filter((p) => isEligible(s, p)).length;
}

/* ------------------------------------------------------------------ hand start */
/** Try to deal the next hand (queued changes applied first). Returns false when the table drops to `waiting`. */
export function beginHand(env: Env, s: S, randomDealer = false): boolean {
  // queued config
  if (s.queuedConfig) { const q = s.queuedConfig; s.queuedConfig = null; applyConfig(env, s, q); }
  // queued stack changes
  for (const id of s.order) {
    const p = s.players[id]!;
    if (!p.queued.length) continue;
    const before = p.stack;
    for (const q of p.queued) {
      const old = p.stack;
      p.stack = q.mode === "ADD" ? old + q.value : q.mode === "REMOVE" ? Math.max(0, old - q.value) : q.value;
      adjustStack(p, q.mode, old, p.stack);
    }
    p.queued = [];
    log(env, s, L.stackUpdated(raw(s, id), before, p.stack));
  }
  levelUpdate(env, s);
  const ante = currentAnte(s);
  if (ante !== s.lastAnte) { log(env, s, L.anteChanged(s.lastAnte, ante)); s.lastAnte = ante; }

  const parts = Object.values(s.players).filter((p) => isEligible(s, p)).sort((a, b) => a.seat! - b.seat!);
  if (parts.length < 2) { s.status = "waiting"; s.hand = null; return false; }
  s.status = "inProgress";
  const lvl = currentLevel(s);
  const number = ++s.handNumber;

  // dealer / button
  if (s.buttonSeat === null || randomDealer) s.buttonSeat = parts[uniformInt(env.entropy, parts.length)]!.seat!;
  const dealerSeat = s.buttonSeat;
  const dealerP = parts.find((p) => p.seat === dealerSeat) ?? null;
  const deadButton = !dealerP;
  const seatOrder = (from: number) => { // participants clockwise strictly after seat `from`
    const a = parts.filter((p) => p.seat! > from), b = parts.filter((p) => p.seat! <= from);
    return [...a, ...b];
  };
  const occupiedAfter = (from: number): PlayerRec | null => {
    const occ = Object.values(s.players).filter((p) => p.seat !== null).sort((a, b) => a.seat! - b.seat!);
    return occ.find((p) => p.seat! > from) ?? occ.find((p) => p.seat! <= from) ?? null;
  };
  let sb: PlayerRec | null; let bb: PlayerRec; let deadSB: PlayerRec | null = null;
  if (parts.length === 2) {
    if (dealerP) { sb = dealerP; bb = parts.find((p) => p !== dealerP)!; }
    else { const o = seatOrder(dealerSeat); sb = o[0]!; bb = o[1]!; }
  } else {
    const cand = occupiedAfter(dealerSeat)!;
    if (parts.includes(cand)) { sb = cand; bb = seatOrder(cand.seat!)[0]!; }
    else { sb = null; deadSB = cand; bb = seatOrder(cand.seat!)[0]!; }
  }

  // deck + commitment (entropy order: [dealer], shuffle, salt, hand id)
  const deck = shuffle(env.entropy);
  const masterSalt = newSalt(env.entropy);
  const id = newHandId(env.entropy);
  const prev = s.prevCommitment || GENESIS_PREV_COMMITMENT;
  const com = commitDeck({ gameId: s.gameId, handNumber: number, handId: id, prevCommitment: prev, deck, masterSalt });
  s.prevCommitment = com.commitment;

  const h: HandRec = {
    id, number, commitment: com.commitment, root: com.root, prevCommitment: prev, deck, masterSalt, cursor: 0, usage: [], dealOrder: [],
    holes: {}, holeIdx: {}, showing: {}, exposed: [], dealerSeat, dealerId: dealerP?.id ?? null, deadButton,
    sbId: sb?.id ?? null, bbId: bb.id, straddleId: null, sbAmt: lvl.sb, bbAmt: lvl.bb,
    participants: parts.map((p) => p.id), status: {}, startStacks: {}, contrib: {}, bets: {}, checked: {}, pot: 0,
    stage: 0, run: 1, runs: 1, board1: [], board2: [], runoutFrom: 0, highest: 0, lastRaise: lvl.bb, toAct: [], noReraise: [], bbChecked: false,
    phase: "betting", closed: false, gapKind: null, actor: null, actionStartedAt: null, deadlineNoBank: null, deadlineWithBank: null, bankActive: false,
    nextStep: null, nextStepAt: null, directToNext: false, ritWaiting: false, ritVotes: {}, rn: null, equity: null, result: null, winningBoard: null,
    showdown: false, rabbit: { enabled: false, hunters: [], cards: [], idx: [], boardBefore: [] }, revealedOnce: false
  };
  s.hand = h;
  for (const p of parts) { h.status[p.id] = "inGame"; h.startStacks[p.id] = p.stack; h.contrib[p.id] = 0; }

  env.fx.push({ kind: "commit", gameId: s.gameId, handNumber: number, handId: id, commitment: com.commitment, prevCommitment: prev, root: com.root, committedAtMs: env.now });
  log(env, s, L.start(number, id, dealerP ? raw(s, dealerP.id) : null));
  log(env, s, L.commitment(com.commitment));

  // joins, bank refill, ledger
  const bankLen = (s.config.timeBankSec ?? 0) * 1000;
  for (const p of parts) {
    if (!p.entered) { log(env, s, L.joined(raw(s, p.id), p.stack)); p.entered = true; }
    p.status = "inGame";
    if (bankLen > 0) p.bankMs = Math.min(bankLen, p.bankMs + bankLen / (s.config.timeBankFillHands ?? 1));
    else p.bankMs = 0;
    markStarted(p, number);
  }
  log(env, s, L.stacks(parts.map((p) => [p.seat!, raw(s, p.id), p.stack] as [number, string, number])));

  // deal hole cards (first active seat left of the dealer, one at a time, two rounds)
  const dealOrder = seatOrder(dealerSeat).map((p) => p.id);
  h.dealOrder = dealOrder;
  const n = dealOrder.length;
  for (let k = 0; k < n; k++) {
    const pid = dealOrder[k]!;
    h.holeIdx[pid] = [k, k + n];
    h.holes[pid] = [deck[k]!, deck[k + n]!];
    h.showing[pid] = [false, false];
  }
  // usage entries in consumption order (one card per entry) so indices increase monotonically: round 1 then round 2
  for (const r of [0, 1]) for (let k = 0; k < n; k++) h.usage.push({ kind: "hole", run: 1, street: 0, playerId: dealOrder[k]!, indices: [k + r * n] });
  h.cursor = 2 * n;
  for (const pid of h.participants) log(env, s, L.yourHand(h.holes[pid]!), pid);

  // posts: antes, missing blinds, blinds, straddle
  const post = (pid: string, amount: number, live: boolean): number => {
    const p = s.players[pid]!; const a = Math.min(amount, p.stack);
    p.stack -= a; h.contrib[pid] = (h.contrib[pid] ?? 0) + a;
    if (live) h.bets[pid] = (h.bets[pid] ?? 0) + a; else h.pot += a;
    if (p.stack === 0) h.status[pid] = "allIn";
    return a;
  };
  if (ante > 0) for (const pid of h.participants) { const a = post(pid, ante, false); log(env, s, L.antePost(raw(s, pid), a)); }
  for (const p of parts) {
    if (p.missedSB && p !== sb && p !== bb) { const a = post(p.id, lvl.sb, false); log(env, s, L.missingSB(raw(s, p.id), a)); }
    p.missedSB = false;
  }
  if (deadSB) { deadSB.missedSB = true; log(env, s, L.deadSB); }
  if (sb) { const a = post(sb.id, lvl.sb, true); log(env, s, L.sb(raw(s, sb.id), a)); }
  { const a = post(bb.id, lvl.bb, true); log(env, s, L.bb(raw(s, bb.id), a)); }
  h.highest = lvl.bb;
  let last = bb;
  // straddle: first player to act after the big blind
  if (s.config.straddleAllowed) {
    const utg = parts.length === 2 ? sb! : seatOrder(bb.seat!)[0]!;
    const amt = STRADDLE_BB * lvl.bb;
    // U-D2: a UTG stack below the straddle size, or a multiple/re-straddle, is not straddled (placeholder behaviour)
    if (utg && utg.straddling && utg.stack + (h.bets[utg.id] ?? 0) >= amt && h.status[utg.id] === "inGame") {
      const add = amt - (h.bets[utg.id] ?? 0);
      post(utg.id, add, true);
      log(env, s, L.straddle(raw(s, utg.id), amt));
      h.straddleId = utg.id; h.highest = amt; last = utg;
    }
  }
  h.lastRaise = lvl.bb;
  const ring = ringAfter(h, s, last.seat!);
  h.toAct = ring.filter((x) => h.status[x] === "inGame");
  fixSingle(h);
  nextActorOrAdvance(env, s, h);
  return true;
}

/** if only one able player and nothing to call, there is nothing to act on */
function fixSingle(h: HandRec): void {
  const able = ableIds(h);
  if (able.length <= 1 && (able.length === 0 || (h.bets[able[0]!] ?? 0) >= h.highest)) h.toAct = [];
}

/* ------------------------------------------------------------------ betting */
const shouldAuto = (p: PlayerRec): boolean => p.away || p.quitNextHand || p.removeQueued;

function nextActorOrAdvance(env: Env, s: S, h: HandRec): void {
  // skip anyone no longer able (all-in / folded)
  h.toAct = h.toAct.filter((x) => h.status[x] === "inGame");
  fixSingle(h);
  if (!h.toAct.length) { setGap(env, h, "NSAA", T.ACTION_GAP, true); return; }
  const id = h.toAct[0]!;
  setActor(env, s, h, id);
}

function setGap(env: Env, h: HandRec, step: "NSAA" | "NSAF", delay: number, advance: boolean): void {
  h.phase = "gap"; h.gapKind = advance ? "advance" : null; h.actor = null;
  h.actionStartedAt = null; h.deadlineNoBank = null; h.deadlineWithBank = null; h.bankActive = false;
  h.nextStep = step; h.nextStepAt = env.now + delay;
}

function setActor(env: Env, s: S, h: HandRec, id: string): void {
  const p = s.players[id]!;
  h.phase = "betting"; h.gapKind = null; h.actor = id; h.nextStep = "FCPFS"; h.bankActive = false;
  h.actionStartedAt = env.now;
  const lim = s.config.decisionLimitSec;
  if (lim === null) { h.deadlineNoBank = null; h.deadlineWithBank = null; h.nextStepAt = null; }
  else {
    h.deadlineNoBank = env.now + ms(lim);
    h.deadlineWithBank = h.deadlineNoBank + (s.config.timeBankSec ? p.bankMs : 0);
    h.nextStepAt = h.deadlineWithBank;
  }
  if (shouldAuto(p)) autoAct(env, s, h, id);
}

/** When the actor times out (U-T6: offline actors use the bank automatically). */
export function timeoutAt(s: S, h: HandRec): number | null {
  if (h.phase !== "betting" || !h.actor || h.deadlineNoBank === null) return null;
  const p = s.players[h.actor]!;
  if (p.disconnectedSince !== null || h.bankActive) return h.deadlineWithBank;
  return h.deadlineNoBank + (h.deadlineWithBank! > h.deadlineNoBank ? ATB_GRACE_MS : 0);
}

/** B3: a player who enters check/fold mode (leave seat, away, queued removal) while the action is ON them is auto-actioned at once (check/fold mode starts immediately). */
export function autoIfActor(env: Env, s: S, id: string): void {
  const h = s.hand;
  if (h && !h.closed && h.phase === "betting" && h.actor === id && s.pausedAt === null && shouldAuto(s.players[id]!)) autoAct(env, s, h, id);
}

function autoAct(env: Env, s: S, h: HandRec, id: string): void {
  act(env, s, h, id, toCall(h, id) === 0 ? { type: "PLAYER_CHECK" } : { type: "PLAYER_FOLD" });
}

export type BetAction = { type: "PLAYER_FOLD" } | { type: "PLAYER_CHECK" } | { type: "PLAYER_CALL" } | { type: "PLAYER_RAISE"; value: number };

export function maxBetFor(s: S, h: HandRec, id: string): number | null {
  if (!s.config.autoTrimBets) return null;
  let cap = 0;
  for (const o of nonFolded(h)) if (o !== id) cap = Math.max(cap, (h.bets[o] ?? 0) + s.players[o]!.stack);
  return Math.min(cap, (h.bets[id] ?? 0) + s.players[id]!.stack);
}

export function canRaise(s: S, h: HandRec, id: string): boolean {
  return !h.noReraise.includes(id) && s.players[id]!.stack > toCall(h, id);
}

/** Apply one betting action by the current actor. Returns false (state untouched) when illegal. */
export function act(env: Env, s: S, h: HandRec, id: string, a: BetAction): boolean {
  if (h.phase !== "betting" || h.actor !== id) return false;
  const p = s.players[id]!; const need = toCall(h, id); const bet = h.bets[id] ?? 0;
  const n = raw(s, id);
  let fold = false;
  let nextToAct: string[] = h.toAct.filter((x) => x !== id);
  if (a.type === "PLAYER_FOLD") {
    fold = true; h.status[id] = "fold"; log(env, s, L.fold(n));
  } else if (a.type === "PLAYER_CHECK") {
    if (need > 0) return false;
    h.checked[id] = true; if (h.stage === 0 && id === h.bbId) h.bbChecked = true;
    log(env, s, L.check(n));
  } else if (a.type === "PLAYER_CALL") {
    if (need <= 0) return false;
    const pay = Math.min(need, p.stack);
    p.stack -= pay; h.bets[id] = bet + pay; h.contrib[id] = (h.contrib[id] ?? 0) + pay;
    if (p.stack === 0) h.status[id] = "allIn";
    log(env, s, L.call(n, h.bets[id]!, p.stack === 0));
  } else {
    if (!canRaise(s, h, id)) return false;
    let v = a.value; const allInTotal = bet + p.stack;
    if (v > allInTotal) v = allInTotal;
    const cap = maxBetFor(s, h, id);
    if (cap !== null && v > cap) v = cap;
    if (!Number.isInteger(v) || v <= h.highest) return false;
    const minTo = h.highest + h.lastRaise;
    const isAllIn = v === allInTotal;
    if (v < minTo && !isAllIn) return false;
    const inc = v - h.highest;
    const full = inc >= h.lastRaise;
    const wasBet = h.highest === 0;
    const acted = h.participants.filter((x) => x !== id && h.status[x] === "inGame" && !h.toAct.includes(x));
    p.stack -= v - bet; h.contrib[id] = (h.contrib[id] ?? 0) + (v - bet); h.bets[id] = v;
    h.highest = v; h.lastRaise = Math.max(inc, h.bbAmt); // U-D4: observed live (08 c): next min-raise uses the short shove's increment
    if (full) h.noReraise = []; else h.noReraise = [...new Set([...h.noReraise, ...acted])];
    if (p.stack === 0) h.status[id] = "allIn";
    log(env, s, wasBet ? L.bet(n, v, p.stack === 0) : L.raise(n, v, p.stack === 0));
    nextToAct = ringAfter(h, s, p.seat!).filter((x) => x !== id && h.status[x] === "inGame");
  }
  // bank accounting
  if (h.bankActive && h.deadlineNoBank !== null) {
    const used = Math.min(p.bankMs, Math.max(0, env.now - h.deadlineNoBank));
    p.bankMs -= used;
  }
  h.toAct = nextToAct;
  const left = nonFolded(h);
  const roundDone = h.toAct.filter((x) => h.status[x] === "inGame").length === 0;
  let delay: number = T.ACTION_GAP;
  if (left.length === 1) delay = T.FOLD_WIN_AWARD_DELAY;
  else if (roundDone && h.stage === 3) delay = T.SHOWDOWN_AWARD_DELAY;
  setGap(env, h, fold ? "NSAF" : "NSAA", delay, true);
  return true;
}

export function activateBank(env: Env, s: S, h: HandRec, id: string): boolean {
  if (h.phase !== "betting" || h.actor !== id || h.deadlineNoBank === null) return false;
  const p = s.players[id]!;
  if (!s.config.timeBankSec || p.bankMs <= 0 || h.bankActive) return false;
  h.bankActive = true; h.nextStepAt = h.deadlineWithBank;
  return true;
}

/* ------------------------------------------------------------------ streets */
function dealStreet(env: Env, s: S, h: HandRec, run: 1 | 2, stage: 1 | 2 | 3): void {
  const burn = h.cursor++;
  h.usage.push({ kind: "burn", run, street: stage, indices: [burn] });
  const k = stage === 1 ? 3 : 1;
  const idx: number[] = [];
  for (let i = 0; i < k; i++) idx.push(h.cursor++);
  h.usage.push({ kind: "board", run, street: stage, indices: idx });
  h.exposed.push(...idx);
  const add = idx.map((i) => h.deck[i]!);
  const board = run === 1 ? h.board1 : h.board2;
  log(env, s, L.street(run, stage, board, add));
  board.push(...add);
  h.stage = stage; h.run = run;
}

function startRound(env: Env, s: S, h: HandRec): void {
  h.highest = 0; h.lastRaise = h.bbAmt; h.noReraise = []; h.checked = {}; h.bets = {};
  const ring = ringAfter(h, s, h.dealerSeat ?? 0);
  h.toAct = ring.filter((x) => h.status[x] === "inGame");
  fixSingle(h);
  nextActorOrAdvance(env, s, h);
}

function collect(h: HandRec): void {
  for (const id of h.participants) h.pot += h.bets[id] ?? 0;
  h.bets = {}; h.checked = {};
}

function returnUncalledBets(env: Env, s: S, h: HandRec): void {
  const u = uncalled(h);
  if (!u) return;
  const [id, amt] = u;
  s.players[id]!.stack += amt; h.bets[id] = (h.bets[id] ?? 0) - amt; h.contrib[id] = (h.contrib[id] ?? 0) - amt;
  if (h.bets[id] === 0) delete h.bets[id];
  log(env, s, L.uncalled(amt, raw(s, id)));
}

/** Called when the post-action gap expires. */
function advance(env: Env, s: S, h: HandRec): void {
  const left = nonFolded(h);
  if (left.length === 1) { returnUncalledBets(env, s, h); collect(h); award(env, s, h, "fold"); return; }
  if (h.toAct.filter((x) => h.status[x] === "inGame").length > 0) { nextActorOrAdvance(env, s, h); return; }
  returnUncalledBets(env, s, h); collect(h);
  if (h.stage === 3) { award(env, s, h, "showdown"); return; }
  if (ableIds(h).length >= 2) { dealStreet(env, s, h, 1, (h.stage + 1) as 1 | 2 | 3); startRound(env, s, h); return; }
  startRunout(env, s, h);
}

/* ------------------------------------------------------------------ run-out / RIT */
function startRunout(env: Env, s: S, h: HandRec): void {
  h.directToNext = true; h.runoutFrom = h.stage; h.actor = null; h.toAct = [];
  const mode = s.config.runItTwice;
  if (mode === "always") { h.runs = 2; log(env, s, L.ritAllYes); /* U-RIT1: wording assumed */ revealStep(env, s, h, 0); return; }
  if (mode === "ask_players") {
    log(env, s, L.ritAsk);
    h.phase = "ritVote"; h.ritWaiting = true; h.ritVotes = {};
    h.nextStep = "NSARD"; h.nextStepAt = env.now + T.RIT_VOTE_WINDOW;
    h.deadlineNoBank = null; h.deadlineWithBank = null; h.actionStartedAt = null;
    return;
  }
  revealStep(env, s, h, 0);
}

export function ritVote(env: Env, s: S, h: HandRec, id: string, yes: boolean): boolean {
  if (h.phase !== "ritVote" || !nonFolded(h).includes(id) || id in h.ritVotes) return false;
  h.ritVotes[id] = yes;
  log(env, s, yes ? L.ritYes(raw(s, id)) : L.ritNo(raw(s, id)));
  if (!yes) { ritDone(env, s, h, false, true); return true; }
  if (nonFolded(h).every((x) => h.ritVotes[x] === true)) ritDone(env, s, h, true, true);
  return true;
}

function ritDone(env: Env, s: S, h: HandRec, unanimous: boolean, answered: boolean): void {
  if (unanimous) { h.runs = 2; log(env, s, L.ritAllYes); } else { h.runs = 1; log(env, s, L.ritSomeNo); }
  h.ritWaiting = false; h.ritVotes = {};
  revealStep(env, s, h, answered ? RIT_REVEAL_DELAY_MS : 0);
}

function revealStep(env: Env, s: S, h: HandRec, delay: number): void {
  h.phase = "runout"; h.rn = null; h.nextStep = "NSAA"; h.nextStepAt = env.now + delay; h.ritWaiting = false;
  if (delay === 0) runoutTick(env, s, h);
}

function showHole(env: Env, s: S, h: HandRec, id: string, both: [boolean, boolean]): boolean {
  const sh = h.showing[id]; if (!sh) return false;
  let changed = false;
  for (let i = 0; i < 2; i++) if (both[i] && !sh[i]) { sh[i] = true; h.exposed.push(h.holeIdx[id]![i]!); changed = true; }
  return changed;
}

function computeEquity(env: Env, h: HandRec): void {
  const ids = nonFolded(h);
  const board = h.run === 2 ? h.board2 : h.board1;
  const res = equity(ids.map((i) => h.holes[i]!), board, env.entropy);
  h.equity = Object.fromEntries(ids.map((id, i) => [id, res[i]!]));
}

function runoutTick(env: Env, s: S, h: HandRec): void {
  if (h.rn === null) {
    // all-in reveal
    if (s.config.revealAllWhenNoAction) {
      for (const id of [...nonFolded(h)].sort((a, b) => s.players[a]!.seat! - s.players[b]!.seat!)) {
        if (showHole(env, s, h, id, [true, true])) log(env, s, L.shows(raw(s, id), h.holes[id]!));
      }
    }
    h.equity = null; // U-Q1/13.3: first pill is the grey 0% until a street is inserted
    h.rn = { run: 1, stage: h.runoutFrom + 1 };
    h.nextStep = "NSAAD"; h.nextStepAt = env.now + T.ALL_IN_REVEAL;
    return;
  }
  const { run, stage } = h.rn;
  if (stage === 9) { award(env, s, h, "runout"); return; }
  if (run === 2 && h.board2.length === 0) h.board2 = h.board1.slice(0, h.runoutFrom === 0 ? 0 : h.runoutFrom === 1 ? 3 : 4);
  dealStreet(env, s, h, run, stage as 1 | 2 | 3);
  computeEquity(env, h);
  h.nextStep = "NSAA";
  if (stage < 3) { h.rn = { run, stage: stage + 1 }; h.nextStepAt = env.now + T.RUNOUT_STREET; }
  else if (run === 1 && h.runs === 2) { h.rn = { run: 2, stage: h.runoutFrom + 1 }; h.nextStepAt = env.now + T.RUNOUT_STREET; }
  else { h.rn = { run, stage: 9 }; h.nextStepAt = env.now + T.RUNOUT_TO_AWARD; }
}

/* ------------------------------------------------------------------ award */
function rankInfo(h: HandRec, id: string, board: readonly CardCode[]) {
  const seven = [...h.holes[id]!, ...board];
  return { score: scoreCodes(seven), seven };
}

function leftOfDealerOrder(h: HandRec, s: S, ids: readonly string[]): string[] {
  const ring = ringAfter(h, s, h.dealerSeat ?? 0);
  return ring.filter((x) => ids.includes(x));
}

function award(env: Env, s: S, h: HandRec, mode: "fold" | "showdown" | "runout"): void {
  h.directToNext = mode === "runout" ? h.directToNext : h.directToNext;
  h.actor = null; h.toAct = []; h.deadlineNoBank = null; h.deadlineWithBank = null; h.actionStartedAt = null; h.bankActive = false;
  h.ritWaiting = false; h.stage = 5; h.rn = null;
  const live = nonFolded(h);
  const pots = computePots(h);
  const res: Record<string, { gained: number; runs: Record<string, { hc: CardCode[]; position: number; winning: boolean }> }> = {};
  const gain = (id: string, v: number) => { (res[id] ??= { gained: 0, runs: {} }).gained += v; };
  const winners = new Set<string>();
  if (live.length === 1) {
    const w = live[0]!; const total = pots.reduce((a, p) => a + p.amount, 0);
    s.players[w]!.stack += total; gain(w, total); winners.add(w);
    log(env, s, L.collected(raw(s, w), total));
    res[w]!.runs["1"] = { hc: [], position: 1, winning: true };
  } else {
    h.showdown = true;
    const runs = h.runs;
    const boards = runs === 2 ? [h.board1, h.board2] : [h.board1];
    // who shows (normal showdown only; run-outs revealed earlier)
    const shownAlready = (id: string) => h.showing[id]![0] && h.showing[id]![1];
    const order = leftOfDealerOrder(h, s, live);
    // SECURITY (Phase C): "must show to win" is evaluated on EVERY run board, otherwise a run-2-only winner is exposed through result.hc / the log without ever showing
    const best: number[][] = boards.map(() => pots.map(() => -1));
    for (const id of order) {
      let shows = shownAlready(id);
      const scs = boards.map((bd) => rankInfo(h, id, bd).score);
      boards.forEach((_bd, bi) => pots.forEach((pt, i) => { if (pt.eligible.includes(id) && scs[bi]! >= best[bi]![i]!) { shows = true; best[bi]![i] = Math.max(best[bi]![i]!, scs[bi]!); } }));
      if (shows && !shownAlready(id)) { showHole(env, s, h, id, [true, true]); log(env, s, L.shows(raw(s, id), h.holes[id]!)); }
      if (shownAlready(id)) boards.forEach((_bd, bi) => pots.forEach((pt, i) => { if (pt.eligible.includes(id)) best[bi]![i] = Math.max(best[bi]![i]!, scs[bi]!); }));
    }
    boards.forEach((board, ri) => {
      const run = (ri + 1) as 1 | 2;
      pots.forEach((pt) => {
        const share = runs === 1 ? pt.amount : run === 1 ? Math.ceil(pt.amount / 2) : Math.floor(pt.amount / 2);
        const scs = pt.eligible.map((id) => [id, rankInfo(h, id, board).score] as const);
        const top = Math.max(...scs.map((x) => x[1]));
        const tied = leftOfDealerOrder(h, s, scs.filter((x) => x[1] === top).map((x) => x[0]));
        const base = Math.floor(share / tied.length); let rem = share - base * tied.length;
        for (const w of tied) {
          const amt = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--;
          if (amt === 0) continue;
          s.players[w]!.stack += amt; gain(w, amt); winners.add(w);
          const seven = rankInfo(h, w, board).seven;
          log(env, s, L.collected(raw(s, w), amt, { name: logName(seven), combo: bestFive(seven), run2: run === 2 }));
          (res[w] ??= { gained: 0, runs: {} });
          res[w]!.runs[String(run)] = { hc: bestFive(seven), position: 1, winning: true };
        }
      });
      // positions for everyone showing
      const all = live.filter((id) => h.showing[id]![0] && h.showing[id]![1]);
      const sc = Object.fromEntries(all.map((id) => [id, rankInfo(h, id, board).score]));
      for (const id of all) {
        const seven = rankInfo(h, id, board).seven;
        const r = (res[id] ??= { gained: 0, runs: {} });
        const pos = 1 + all.filter((o) => sc[o]! > sc[id]!).length;
        const prev = r.runs[String(run)];
        r.runs[String(run)] = { hc: bestFive(seven), position: pos, winning: prev?.winning ?? false };
      }
    });
    const wb = new Set<CardCode>();
    boards.forEach((board, ri) => {
      for (const id of winners) {
        const r = res[id]?.runs[String(ri + 1)];
        if (r?.winning) for (const c of r.hc) if (board.includes(c)) wb.add(c);
      }
    });
    h.winningBoard = [...wb];
  }
  for (const id of winners) s.players[id]!.winCount++;
  h.pot = 0; h.bets = {};
  h.result = res;
  // rabbit hunt: hand ended before the river
  if (s.config.rabbitHunt && h.board1.length < 5 && live.length === 1) {
    const before = [...h.board1]; const cs: CardCode[] = []; const idx: number[] = [];
    for (let st = h.board1.length === 0 ? 1 : h.board1.length === 3 ? 2 : 3; st <= 3; st++) {
      const burn = h.cursor++; h.usage.push({ kind: "burn", run: 1, street: st as 1 | 2 | 3, rabbit: true, indices: [burn] });
      const k = st === 1 ? 3 : 1; const ix: number[] = [];
      for (let i = 0; i < k; i++) ix.push(h.cursor++);
      h.usage.push({ kind: "board", run: 1, street: st as 1 | 2 | 3, rabbit: true, indices: ix });
      idx.push(...ix); cs.push(...ix.map((i) => h.deck[i]!));
    }
    h.rabbit = { enabled: true, hunters: [], cards: cs, idx, boardBefore: before };
  }
  // away players stand up at hand end
  for (const id of h.participants) {
    const p = s.players[id]!;
    if (p.away && !s.config.dealToAway && p.status === "inGame") { p.status = "standingUp"; p.entered = false; log(env, s, L.standUp(raw(s, id), p.stack)); }
  }
  log(env, s, L.end(h.number));
  h.phase = "result";
  const foldWin = live.length === 1;
  h.nextStep = foldWin ? "NSAGR" : "NSAGRS";
  h.nextStepAt = env.now + (foldWin ? T.FOLD_WIN_TO_NEXT_HAND : mode === "runout" ? T.RUNOUT_AWARD_TO_NEXT_HAND : T.SHOWDOWN_PRESENTATION[s.config.showdownTime]);
}

/* ------------------------------------------------------------------ rabbit / show */
export function rabbitReveal(env: Env, s: S, h: HandRec, id: string): boolean {
  if (!h.rabbit.enabled || (h.phase !== "result" && h.phase !== "idle") || h.rabbit.hunters.includes(id)) return false;
  const p = s.players[id]; if (!p || p.seat === null) return false;
  h.rabbit.hunters.push(id);
  const add = h.rabbit.cards;
  log(env, s, L.undealt(h.rabbit.boardBefore, add), id);
  for (const i of h.rabbit.idx) if (!h.exposed.includes(i)) h.exposed.push(i);
  if (h.phase === "result" && s.config.autoDeal && h.nextStepAt !== null) h.nextStepAt += T.RABBIT_EXTENSION;
  republishReveal(env, s, h);
  return true;
}

export function showCards(env: Env, s: S, h: HandRec, id: string, which: "all" | CardCode): boolean {
  if (h.phase !== "result" && h.phase !== "idle") return false;
  const hole = h.holes[id]; if (!hole) return false;
  const want: [boolean, boolean] = which === "all" ? [true, true] : [hole[0] === which, hole[1] === which];
  if (!want[0] && !want[1]) return false;
  const shown = hole.filter((_, i) => want[i]);
  if (!showHole(env, s, h, id, want)) return false;
  log(env, s, L.shows(raw(s, id), shown));
  republishReveal(env, s, h);
  return true;
}

function revealEffect(env: Env, s: S, h: HandRec) {
  return buildReveal({ gameId: s.gameId, handNumber: h.number, handId: h.id, prevCommitment: h.prevCommitment, deck: h.deck, masterSalt: h.masterSalt, exposed: h.exposed, dealOrder: h.dealOrder, usage: allUsage(h) as FairnessUsage[], at: env.now });
}
function republishReveal(env: Env, s: S, h: HandRec): void {
  if (h.revealedOnce) env.fx.push({ kind: "reveal", reveal: revealEffect(env, s, h) });
}

/* ------------------------------------------------------------------ close / next hand */
export function closeHand(env: Env, s: S): void {
  const h = s.hand!;
  h.closed = true;
  const rv = revealEffect(env, s, h);
  h.revealedOnce = true;
  env.fx.push({ kind: "reveal", reveal: rv });
  log(env, s, L.reveal(rv.root, rv.cards.length), undefined, h.number);
  h.phase = "idle"; h.nextStep = null; h.nextStepAt = null;
  // next button: next occupied seat (roster of the finished hand)
  const seats = seatedIds(s).map((id) => s.players[id]!.seat!).sort((a, b) => a - b);
  if (s.buttonSeat !== null && seats.length) s.buttonSeat = seats.find((x) => x > s.buttonSeat!) ?? seats[0]!;
  // quits
  for (const id of seatedIds(s)) {
    const p = s.players[id]!;
    if (p.quitNextHand || p.removeQueued || (p.stack === 0 && !s.config.allowRebuy)) leaveSeat(env, s, id);
  }
  if (s.stopQueued) {
    s.stopQueued = false; s.status = "waiting"; s.buttonSeat = null; s.hand = null;
    for (const p of Object.values(s.players)) p.missedSB = false;
    return;
  }
  if (s.config.autoDeal) requestNextHand(env, s);
  else if (eligibleCount(s) < 2 && !busted(s).length) { s.status = "waiting"; s.hand = null; }
}

export function leaveSeat(env: Env, s: S, id: string): void {
  const p = s.players[id]!;
  log(env, s, L.quits(raw(s, id), p.stack));
  closeSession(p, p.stack, s.hand?.number ?? s.handNumber);
  p.seat = null; p.status = "watching"; p.quitNextHand = false; p.removeQueued = false; p.away = false; p.quitCount++; p.entered = false;
  p.stack = 0; p.queued = [];
}

const busted = (s: S): string[] => seatedIds(s).filter((id) => s.players[id]!.stack === 0 && s.players[id]!.status !== "standingUp");

/** Auto-deal or owner "Next Hand": rebuy phase first when busted players may rebuy. */
export function requestNextHand(env: Env, s: S): void {
  const b = busted(s);
  if (s.config.allowRebuy && b.length) { startRebuy(env, s, b); return; }
  if (!beginHand(env, s)) return;
}

/* ------------------------------------------------------------------ rebuy (U-R1 resolved live, 08 d) */
function startRebuy(env: Env, s: S, ids: string[]): void {
  log(env, s, L.rebuyAsk);
  s.rebuy = { phase: "decision", deadlineAt: env.now + ms(REBUY_WINDOW_SEC), ids, requests: Object.fromEntries(ids.map((i) => [i, null])), resolved: [] };
  rebuyProgress(env, s);
}

function rebuyProgress(env: Env, s: S): void {
  const r = s.rebuy!;
  const pending = r.ids.filter((i) => !r.resolved.includes(i));
  if (!pending.length) { s.rebuy = null; if (!beginHand(env, s)) return; return; }
  r.phase = pending.every((i) => r.requests[i] !== null) ? "approval" : "decision";
}

export function rebuyRequest(env: Env, s: S, id: string, value: number): boolean {
  const r = s.rebuy; if (!r || !r.ids.includes(id) || r.resolved.includes(id)) return false;
  r.requests[id] = value;
  log(env, s, L.rebuyRequested(raw(s, id), value));
  rebuyProgress(env, s); return true;
}
export function rebuyDecline(env: Env, s: S, id: string): boolean {
  const r = s.rebuy; if (!r || !r.ids.includes(id) || r.resolved.includes(id)) return false;
  r.resolved.push(id); leaveSeat(env, s, id); rebuyProgress(env, s); return true;
}
export function rebuyResolve(env: Env, s: S, id: string, approve: boolean, stack: number): boolean {
  const r = s.rebuy; if (!r || !r.ids.includes(id) || r.resolved.includes(id) || r.requests[id] === null) return false;
  r.resolved.push(id);
  const p = s.players[id]!;
  if (approve) {
    p.stack = stack; p.rebuyCount++;
    const c = curSession(p); if (c) { c.buy_in += stack; c.movements.push({ kind: "addStack", value: stack }); }
    log(env, s, L.rebought(raw(s, id), stack));
  } else leaveSeat(env, s, id);
  rebuyProgress(env, s); return true;
}
function rebuyExpire(env: Env, s: S): void {
  const r = s.rebuy!;
  for (const id of r.ids) if (!r.resolved.includes(id)) { r.resolved.push(id); leaveSeat(env, s, id); }
  rebuyProgress(env, s);
}

/* ------------------------------------------------------------------ tick / wake */
export function tickAll(env: Env, s: S): void {
  if (s.pausedAt !== null) return;
  for (let guard = 0; guard < 200; guard++) {
    if (s.rebuy) { if (env.now >= s.rebuy.deadlineAt) { rebuyExpire(env, s); continue; } return; }
    const h = s.hand; if (!h || h.closed) return;
    if (h.phase === "betting") {
      const t = timeoutAt(s, h);
      if (t !== null && env.now >= t && h.actor) { autoAct(env, s, h, h.actor); continue; }
      return;
    }
    if (h.nextStepAt === null || env.now < h.nextStepAt) return;
    if (h.phase === "gap") advance(env, s, h);
    else if (h.phase === "ritVote") ritDone(env, s, h, false, false);
    else if (h.phase === "runout") runoutTick(env, s, h);
    else if (h.phase === "result") closeHand(env, s);
    else return;
  }
}

export function wakeAt(s: S): number | null {
  if (s.pausedAt !== null) return null;
  if (s.rebuy) return s.rebuy.deadlineAt;
  const h = s.hand; if (!h || h.closed) return null;
  if (h.phase === "betting") return timeoutAt(s, h);
  return h.nextStepAt;
}

export function shiftTimes(s: S, dt: number): void {
  const h = s.hand;
  if (h) {
    for (const k of ["actionStartedAt", "deadlineNoBank", "deadlineWithBank", "nextStepAt"] as const) if (h[k] !== null) h[k] = h[k]! + dt;
  }
  if (s.rebuy) s.rebuy.deadlineAt += dt;
  if (s.blindClockAt !== null) s.blindClockAt += dt;
  for (const p of Object.values(s.players)) if (p.disconnectedSince !== null) p.disconnectedSince += dt;
}

export { openSession, CANONICAL_DECK, chipName, cards };
