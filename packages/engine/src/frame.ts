/** Per-recipient projection (ARCH 5.4). The ONLY place that decides what a viewer may know. */
import { PROTOCOL_VERSION, type CardSlot, type Frame, type HandPlayerCards, type HandView, type PlayerInfo, type PlayerResult, type TurnView } from "@pokerthen/shared";
import { chipName } from "./eval/names.js";
import { currentLevel, maxBetFor, nextBlindInfo, timeoutAt } from "./hand/flow.js";
import { handRunning, seatedIds, type HandRec, type PlayerRec, type S } from "./state.js";

export function buildFrame(s: S, viewer: string | null, now: number): Frame {
  const h = s.hand;
  const vp = viewer ? s.players[viewer] : undefined;
  const isOwner = viewer === s.ownerId;
  const players: Record<string, PlayerInfo> = {};
  for (const id of s.order) {
    const p = s.players[id]!;
    const visible = isOwner || id === viewer || p.seat !== null || p.status === "requestedGameIngress" || s.godModeIds.includes(id) /* B3: granted spectators are listed for everybody (name+id only): the client counts/lists them and the warning modal names them */;
    if (!visible) continue;
    players[id] = playerInfo(s, p, isOwner || id === viewer);
  }
  const seats = seatedIds(s).map((id) => [s.players[id]!.seat!, id] as [number, string]);
  const lvl = currentLevel(s);
  const nb = nextBlindInfo(s);
  const frame: Frame = {
    meta: { id: s.gameId, now, pre: 0, sN: now, version: PROTOCOL_VERSION, mEV: 0 },
    table: {
      status: s.status, ownerId: s.ownerId, pausedAt: s.pausedAt, stopQueued: s.stopQueued, handNumber: s.handNumber,
      configQueued: s.queuedConfig !== null, config: s.config, nextBlindAt: nb.at, nextBlind: nb.next,
      spectatorMode: s.config.spectatorMode, godModeIds: s.godModeIds,
      waitingMessage: h && h.closed && h.phase === "idle" && !s.config.autoDeal ? "Waiting for the owner to deal the next hand." : null,
      blinds: { sb: lvl.sb, bb: lvl.bb, ante: s.config.antes ? lvl.ante : null, level: Math.min(s.blindLevel, s.config.blindLevels.length - 1) + 1 },
      spectatorCount: Object.values(s.players).filter((p) => p.seat === null && p.status === "watching" && p.disconnectedSince === null && p.id !== s.ownerId).length
    },
    seats, players,
    hand: h ? handView(s, h) : null,
    turn: turnView(s, h),
    cards: h ? cardsView(s, h, viewer) : {},
    result: h && h.result ? resultView(h) : null,
    rabbit: {
      enabled: !!h && h.rabbit.enabled, hunters: h ? h.rabbit.hunters : [],
      cards: h && viewer && h.rabbit.hunters.includes(viewer) ? { "1": h.rabbit.cards } : null
    }
  };
  if (vp) frame.you = { id: vp.id, name: vp.name, mutedIds: vp.muted, straddling: vp.straddling, isOwner };
  return frame;
}

function playerInfo(s: S, p: PlayerRec, detail: boolean): PlayerInfo {
  const info: PlayerInfo = {
    id: p.id, name: p.name,
    status: p.seat !== null && (p.quitNextHand || p.removeQueued) ? "quiting" : p.status,
    // SPEC 4.5 / W4: displayed stack = players[].stack - currentBet - gained, so the frame stack still includes the open street bet
    stack: p.stack + (s.hand?.bets[p.id] ?? 0), winCount: p.winCount, quitCount: p.quitCount
  };
  if (detail && p.status === "requestedGameIngress") { info.intendedSeat = p.intendedSeat; info.requestedStack = p.requestedStack; }
  if (p.away || p.status === "standingUp") info.away = true;
  if (p.quitNextHand) info.quitNextHand = true;
  if (p.disconnectedSince !== null) info.disconnectedSince = p.disconnectedSince;
  if (s.godModeIds.includes(p.id)) info.spectator = true;
  if (p.allowSpectator && p.seat !== null) info.allowSpectator = true;
  if (p.rebuyCount) info.rebuyCount = p.rebuyCount;
  if (p.emoji) info.emoji = p.emoji;
  return info;
}

function handView(s: S, h: HandRec): HandView {
  const bets: Record<string, number | "check"> = {};
  for (const id of h.participants) {
    if (h.status[id] === "fold") continue;
    if ((h.bets[id] ?? 0) > 0) bets[id] = h.bets[id]!;
    else if (h.checked[id]) bets[id] = "check";
  }
  const running = h.phase === "betting" || h.phase === "gap";
  const options = running && h.highest > 0 ? h.toAct.filter((id) => (h.bets[id] ?? 0) === h.highest) : [];
  return {
    handNumber: h.number, handId: h.id, commitment: h.commitment, dealerSeat: h.dealerSeat, deadButton: h.deadButton, dealerId: h.dealerId,
    smallBlindId: h.sbId, bigBlindId: h.bbId, straddleId: h.straddleId, inHandIds: h.participants, playerStatus: { ...h.status },
    street: { run: h.stage === 5 ? (h.runs === 2 ? 2 : 1) : h.run, stage: h.stage },
    runs: h.runs, board: h.runs === 2 ? { "1": h.board1, "2": h.board2 } : { "1": h.board1 },
    pot: h.pot, bets, highestBet: h.highest, minRaise: h.highest + h.lastRaise,
    maxBet: h.actor ? maxBetFor(s, h, h.actor) : null,
    optionIds: options, noReraiseIds: h.noReraise, bigBlindChecked: h.bbChecked, directToNext: h.directToNext, winningBoardCards: h.winningBoard
  };
}

function turnView(s: S, h: HandRec | null): TurnView {
  const bankMs: Record<string, number> = {};
  for (const id of seatedIds(s)) bankMs[id] = Math.round(s.players[id]!.bankMs);
  const t: TurnView = {
    playerId: null, taking: null, actionStartedAt: null, deadlineNoBank: null, deadlineWithBank: null, nextStep: null, nextStepAt: null,
    bankMs, ritWaiting: false, ritVotes: {}, rebuyPromptIds: []
  };
  if (h && !h.closed) {
    t.playerId = h.actor; t.taking = h.phase === "betting" ? h.actor : null;
    t.actionStartedAt = h.actionStartedAt; t.deadlineNoBank = h.deadlineNoBank; t.deadlineWithBank = h.deadlineWithBank;
    t.nextStep = h.nextStep; t.nextStepAt = h.phase === "betting" ? (h.bankActive ? h.deadlineWithBank : h.deadlineNoBank) : h.nextStepAt; // INTEGRATION: nextStepAt only moves to the with-bank deadline once ATB was sent (client derives "Extra Time Activated" from it)
    t.ritWaiting = h.ritWaiting; t.ritVotes = { ...h.ritVotes };
    if (h.actor && s.players[h.actor]?.disconnectedSince != null) t.offlineLimitAt = timeoutAt(s, h);
  }
  if (s.rebuy) {
    const r = s.rebuy;
    t.rebuyPromptIds = r.ids.filter((i) => !r.resolved.includes(i));
    t.nextStep = r.phase === "decision" ? "NSARB" : "FOAR"; t.nextStepAt = r.deadlineAt;
    t.rebuy = { phase: r.phase, deadlineAt: r.deadlineAt, requests: Object.fromEntries(Object.entries(r.requests).filter(([i, v]) => v !== null && !r.resolved.includes(i))) }; // B3: only pending requests (the client treats `id in requests` as 'already requested')
  }
  return t;
}

function cardsView(s: S, h: HandRec, viewer: string | null): Record<string, HandPlayerCards> {
  const out: Record<string, HandPlayerCards> = {};
  const vp = viewer ? s.players[viewer] : undefined;
  const god = !!vp && vp.seat === null && s.config.spectatorMode && s.godModeIds.includes(vp.id);
  const live = h.directToNext && h.equity && h.stage !== 5;
  for (const id of h.participants) {
    const hole = h.holes[id]!; const sh = h.showing[id]!;
    const anyShow = sh[0] || sh[1]; const allShow = sh[0] && sh[1];
    const own = id === viewer;
    const folded = h.status[id] === "fold";
    const canSee = own || (god && s.players[id]!.allowSpectator);
    let slots: CardSlot[];
    if (folded && !anyShow) slots = [];
    else slots = hole.map((c, i) => (sh[i] ? { value: c, showing: true } : canSee ? { value: c, showing: false } : { value: null, showing: false }));
    const e: HandPlayerCards = { cards: slots };
    if (!folded || anyShow) {
      const b1 = h.board1; const b2 = h.board2;
      const showName = allShow || (own && !folded) || (own && anyShow);
      if (showName && b1.length >= 3 && (allShow || own)) {
        e.name1 = chipName([...hole, ...b1]);
        if (h.runs === 2 && b2.length >= 3) e.name2 = chipName([...hole, ...b2]);
      }
      if (allShow && live && h.equity && id in h.equity) e.prob1 = h.equity[id]!;
    }
    if (own && h.rabbit.hunters.includes(id)) {
      const full = [...h.rabbit.boardBefore, ...h.rabbit.cards];
      e.name1RH = chipName([...hole, ...full]);
    }
    out[id] = e;
  }
  return out;
}

function resultView(h: HandRec): Record<string, PlayerResult> {
  const out: Record<string, PlayerResult> = {};
  for (const [id, r] of Object.entries(h.result!)) {
    const runs: PlayerResult["runs"] = {};
    for (const [k, v] of Object.entries(r.runs)) runs[k as "1" | "2"] = { hc: v.hc, position: v.position, ...(v.winning ? { winning: true } : {}) };
    out[id] = { runs, gained: r.gained };
  }
  return out;
}

export { handRunning };
