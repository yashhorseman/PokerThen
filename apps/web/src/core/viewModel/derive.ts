import {
  SEATED_STATUSES,
  TABLE_SEATS,
  formatValue,
  type BoardCardVM,
  type BoardVM,
  type CardCode,
  type CenterMessageVM,
  type ConnectionVM,
  type DealerVM,
  type Frame,
  type HandChipVM,
  type HoleCardVM,
  type InfoVM,
  type Orientation,
  type OwnerControlsVM,
  type PlayerId,
  type PlayerVM,
  type PlayerStatusLabel,
  type PotVM,
  type Prefs,
  type SeatVM,
  type TableViewModel,
  type TimerVM,
  type YouStateVM,
  type RebuyVM
} from "@pokerthen/shared";
import { deriveActionBar, HIDDEN_ACTION_BAR } from "./actionBar";
import { isSeated, positionForSeat, seatForPosition, seatOf } from "./rotation";
import type { Bubble } from "../store/gameStore";
import type { Intent } from "../store/intent";
import { formatMMSS } from "../util";

export interface DeriveCtx {
  prefs: Prefs;
  /** server-synced accessor (stable identity) */
  serverNow: () => number;
  orientation: Orientation;
  connection: ConnectionVM;
  gameId: string;
  emojis: Record<PlayerId, string | null>;
  bubbles: Record<PlayerId, Bubble>;
  intent: Intent | null;
  lockedUntil: number;
  ownCards: { handId: string; cards: CardCode[] } | null;
  ritLocal: boolean | null;
  /** viewer's muted ids (store.you.mutedIds) */
  muted: PlayerId[];
}

/** Current blinds: frame field when the server provides it (docs/requests/w4-frame-current-blinds.md), else level 1. */
export function currentBlinds(frame: Frame): { sb: number; bb: number; ante: number | null } {
  const t = frame.table;
  if (t.blinds) return { sb: t.blinds.sb, bb: t.blinds.bb, ante: t.blinds.ante ?? null };
  const lvl = frame.table.config.blindLevels[0];
  return lvl ? { sb: lvl.sb, bb: lvl.bb, ante: lvl.ante } : { sb: 10, bb: 20, ante: null };
}

const frozenNowCache = new Map<number, () => number>();
/** stable accessor returning a frozen "now" (pause uses `pausedAt` as now, SPEC 7.3) */
export function frozenNow(ts: number): () => number {
  let f = frozenNowCache.get(ts);
  if (!f) {
    if (frozenNowCache.size > 8) frozenNowCache.clear();
    f = () => ts;
    frozenNowCache.set(ts, f);
  }
  return f;
}

function startedHand(frame: Frame): boolean {
  return frame.hand !== null;
}

function holeCards(
  frame: Frame,
  id: PlayerId,
  isYou: boolean,
  folded: boolean,
  own: { handId: string; cards: CardCode[] } | null
): { cards: HoleCardVM[]; cardsFolded: boolean } {
  const slots = frame.cards[id]?.cards ?? [];
  const result = frame.result;
  const winning = new Set<CardCode>();
  const pr = result?.[id];
  if (pr) for (const r of Object.values(pr.runs)) if (r?.winning) for (const c of r.hc) winning.add(c);
  const anyWinningHc = result ? Object.values(result).some((p) => Object.values(p.runs).some((r) => r?.winning)) : false;
  if (slots.length === 0) {
    // folded own cards stay visible (dimmed) in your seat; the frame drops them
    if (isYou && folded && own && own.handId === frame.hand?.handId) {
      return { cards: own.cards.map((code) => ({ code, faceUp: true, up: false, dim: true, sneak: false })), cardsFolded: false };
    }
    return { cards: [], cardsFolded: folded };
  }
  const cards = slots.map<HoleCardVM>((s) => {
    const code = s.value;
    const faceUp = code !== null;
    const inWinning = !!code && winning.has(code);
    return {
      code,
      faceUp,
      up: s.showing && inWinning,
      dim: (isYou && folded) || (s.showing && !!result && anyWinningHc && !inWinning),
      // reference rule: `sneak` only for a face you can see that is NOT your own and NOT showing to everyone (spectator/god-mode view of hidden hands); never your own hole cards
      sneak: faceUp && !s.showing && !isYou
    };
  });
  return { cards, cardsFolded: folded && !slots.some((s) => s.showing) };
}

function statusLabel(frame: Frame, id: PlayerId, folded: boolean, quitting: boolean, away: boolean): PlayerStatusLabel {
  const info = frame.players[id]!;
  if (folded) return "Fold";
  if (info.status === "waitingNextGameToEnter") return "In Next Hand";
  if (quitting) return "Quitting";
  if (away) return "Away";
  if (frame.table.status === "waiting" && info.status === "inGame") return "Waiting";
  return null;
}

function handChip(frame: Frame, id: PlayerId, isYou: boolean): HandChipVM | null {
  const c = frame.cards[id];
  if (!c) return null;
  const hand = frame.hand;
  if (c.name1RH) return { rows: [{ text: `(RH: ${c.name1RH})` }], twoRuns: false, tone: "red", rabbit: true };
  if (!c.name1 && !c.name2) return null;
  const twoRuns = !!hand && hand.runs === 2 && !!c.name2;
  const pr = frame.result?.[id];
  if (twoRuns) {
    return {
      rows: [
        { text: c.name1 ?? "", run: 1, active: !!pr?.runs["1"]?.winning },
        { text: c.name2 ?? "", run: 2, active: !!pr?.runs["2"]?.winning }
      ],
      twoRuns: true,
      tone: isYou ? "red" : "blue",
      rabbit: false
    };
  }
  const text = c.name1 ?? c.name2 ?? "";
  return { rows: [{ text }], twoRuns: false, tone: isYou ? "red" : "blue", rabbit: false };
}

function derivePlayer(frame: Frame, id: PlayerId, ctx: DeriveCtx, equityMax: number | null, fmt: (n: number) => string): PlayerVM {
  const info = frame.players[id]!;
  const hand = frame.hand;
  const youId = frame.you?.id ?? "";
  const isYou = id === youId;
  const folded = hand?.playerStatus[id] === "fold";
  const away = !!info.away;
  const offline = info.disconnectedSince != null;
  const quitting = info.status === "quiting" || !!info.quitNextHand;
  const pr = frame.result?.[id];
  const rawBet = hand?.bets[id];
  const numBet = typeof rawBet === "number" ? rawBet : 0;
  const gained = pr?.gained ?? 0;
  // SPEC 4.5: stack shown = stack minus the current street bet; after a result `<stack before gain> [+gain]`.
  // U: frame stack semantics vs engine (docs/requests/w4-frame-current-blinds.md note 2)
  let shown = info.stack - numBet - (gained ? gained : 0);
  if (shown < 0) shown = 0;
  const allInStatus = hand?.playerStatus[id] === "allIn";
  const stackIsAllIn = !!hand && !gained && (allInStatus || (shown === 0 && hand.inHandIds.includes(id) && !folded));
  const { cards, cardsFolded } = holeCards(frame, id, isYou, folded, ctx.ownCards);
  const c = frame.cards[id];
  const showingAny = !!c?.cards.some((s) => s.showing && s.value);
  let equity: PlayerVM["equity"] = null;
  if (hand?.directToNext && c?.prob1 != null && showingAny && hand.street?.stage !== 5) {
    const pct = Math.round(c.prob1);
    equity = { pct, leader: equityMax !== null && pct === equityMax, gray: hand.street?.stage === 0 && hand.street.run === 1 };
  }
  const taking = frame.turn.taking === id;
  let timer: TimerVM | null = null;
  const t = frame.turn;
  if (taking && t.actionStartedAt != null && t.deadlineNoBank != null && t.deadlineWithBank != null) {
    const paused = frame.table.pausedAt != null;
    timer = {
      actionStartedAt: t.actionStartedAt,
      deadlineNoBank: t.deadlineNoBank,
      deadlineWithBank: t.deadlineWithBank,
      serverNow: paused ? frozenNow(frame.table.pausedAt!) : ctx.serverNow,
      paused,
      offline,
      bankMs: t.bankMs[id] ?? 0
    };
  }
  const bubble = ctx.bubbles[id];
  const winner = !!pr && (gained > 0 || Object.values(pr.runs).some((r) => r?.winning));
  return {
    id,
    name: info.name,
    isYou,
    isOwner: frame.table.ownerId === id,
    stackText: stackIsAllIn ? "All In" : fmt(shown),
    stackIsAllIn,
    statusLabel: statusLabel(frame, id, folded, quitting, away),
    away,
    offline,
    quitting,
    folded,
    isDealer: hand?.dealerId === id,
    isDecision: taking,
    isWinner: winner,
    gainedText: gained ? `${gained > 0 ? "+" : "-"}${fmt(Math.abs(gained))}` : null,
    gainedNegative: gained < 0,
    bet: rawBet === undefined || rawBet === 0 ? null : rawBet === "check" ? (folded ? null : { text: "check", check: true }) : { text: fmt(rawBet), check: false },
    cards,
    cardsFolded,
    handChip: handChip(frame, id, isYou),
    equity,
    timer,
    winCount: info.winCount,
    quitCount: info.quitCount,
    statusSuffix: away ? " (Away)" : offline ? " (Offline)" : null,
    muted: ctx.muted.includes(id),
    allowsSpectators: !!info.allowSpectator,
    disconnectedSince: info.disconnectedSince ?? null,
    emoji: ctx.prefs.hideMoodEmojis ? null : (ctx.emojis[id] ?? info.emoji ?? null),
    bubble: bubble ? { text: bubble.text, until: bubble.until } : null
  };
}

function deriveBoard(frame: Frame, youSeated: boolean): BoardVM {
  const hand = frame.hand;
  const b1 = hand?.board["1"] ?? [];
  const b2 = hand?.board["2"] ?? [];
  const winningCodes = new Set(hand?.winningBoardCards ?? []);
  const atResult = frame.result !== null;
  const hasWinning = atResult && winningCodes.size > 0;
  const runTwoStarted = hand?.street?.run === 2;
  const card = (code: CardCode, run: 1 | 2): BoardCardVM => {
    const hl = winningCodes.has(code);
    return {
      code,
      flipped: true,
      highlighted: hl,
      semiHide: (hasWinning && !hl) || (run === 1 && runTwoStarted),
      rabbit: false,
      afterPadding: run === 2
    };
  };
  const run1 = b1.map((c) => card(c, 1));
  const run2 = b2.map((c) => card(c, 2));
  const rabbitCards = frame.rabbit.cards?.["1"] ?? [];
  const revealed = rabbitCards.length > 0;
  if (revealed) {
    // revealed undealt cards replace the backs (translucent), left to right after the dealt board
    const dealt = new Set(b1);
    for (const code of rabbitCards) {
      if (dealt.has(code)) continue;
      run1.push({ code, flipped: true, highlighted: false, semiHide: true, rabbit: true, afterPadding: false });
    }
  }
  const missing = Math.max(0, 5 - b1.length);
  const rabbitStage = frame.rabbit.enabled && atResult && youSeated && b1.length < 5 && !(hand?.runs === 2);
  return {
    run1,
    run2,
    rabbitSlots: rabbitStage && !revealed ? missing : 0,
    rabbitAvailable: rabbitStage && !revealed,
    rabbitMessage: frame.rabbit.enabled && frame.rabbit.hunters.length > 0
  };
}

function centerMessage(frame: Frame, now: number, isOwner: boolean, canNextHand: boolean, spectatorGranted: boolean): CenterMessageVM {
  const t = frame.turn;
  const secs = (target: number | null) => (target == null ? null : Math.max(0, Math.floor((target - now) / 1000)));
  if (frame.table.pausedAt != null) return { kind: "paused", text: "The room owner paused the game.", seconds: null };
  if (t.nextStep === "FOAR") {
    const s = secs(t.nextStepAt);
    return { kind: "rebuyApproval", text: `Waiting for the owner to approve/deny the pending rebuys. (${s ?? 0} seconds)`, seconds: s };
  }
  if (t.rebuyPromptIds.length > 0) {
    const s = secs(t.nextStepAt);
    return { kind: "rebuyDecision", text: `Waiting for busted players to make rebuy decision. (${s ?? 0} seconds)`, seconds: s };
  }
  if (t.ritWaiting) {
    const s = secs(t.nextStepAt) ?? 0;
    return { kind: "ritWait", text: `Waiting for run it twice decisions (${s}s)`, seconds: s };
  }
  if (!isOwner && !frame.table.config.autoDeal && frame.table.status === "inProgress" && frame.result !== null && t.nextStep === null) {
    return { kind: "waitOwnerDeal", text: frame.table.waitingMessage ?? "Waiting for the owner to deal the next hand.", seconds: null };
  }
  if (!isOwner && !canNextHand && frame.table.waitingMessage) return { kind: "waitOwnerDeal", text: frame.table.waitingMessage, seconds: null };
  if (frame.rabbit.enabled && frame.rabbit.hunters.length > 0 && frame.result !== null) {
    return { kind: "rabbit", text: "Some players are seeing the undealt cards.", seconds: null };
  }
  if (spectatorGranted) return { kind: "spectatorMode", text: "Spectator Mode Activated", seconds: null };
  return { kind: "none", text: null, seconds: null };
}

export function emptyViewModel(gameId: string, connection: ConnectionVM, orientation: Orientation, prefs: Prefs): TableViewModel {
  const seats: SeatVM[] = Array.from({ length: TABLE_SEATS }, (_, i) => ({
    position: i + 1,
    seatNo: i + 1,
    player: null,
    canSit: false,
    requestedByYou: false
  }));
  return {
    orientation,
    connection,
    gameId,
    youId: "",
    youSeated: false,
    seats,
    board: { run1: [], run2: [], rabbitSlots: 0, rabbitAvailable: false, rabbitMessage: false },
    dealer: { dealerPosition: null, dead: false, straddlePosition: null },
    pot: { mainText: "0", totalText: null },
    info: { ownerName: null, typeLabel: "NLH", blindsText: "", anteText: null, nextBlindText: null },
    center: { kind: "none", text: null, seconds: null },
    action: HIDDEN_ACTION_BAR,
    owner: {
      isOwner: false,
      canStart: false,
      canNextHand: false,
      canPause: false,
      paused: false,
      canStop: false,
      stopQueued: false,
      pendingRequests: 0,
      quickAcceptQueue: []
    },
    config: undefined as never,
    waitingBanner: false,
    tableStatus: "waiting",
    nextStep: null,
    spectatorCount: 0,
    spectatorMode: false,
    fourColor: prefs.deckStyle === "four-color",
    bbMode: prefs.displayValueStyle === "big-blind",
    handNumber: 0
  };
}

/**
 * Pure projection Frame -> TableViewModel (ARCH 10.1). `prev` is the previous frame (unused by most slices; kept for
 * transition-dependent flags). Everything time dependent reads `ctx.serverNow()` once.
 */
export function deriveViewModel(frame: Frame, prev: Frame | null, ctx: DeriveCtx): TableViewModel {
  void prev;
  const now = ctx.serverNow();
  const youId = frame.you?.id ?? "";
  const mySeat = isSeated(frame, youId) ? seatOf(frame, youId) : null;
  const youSeated = mySeat !== null;
  const blinds = currentBlinds(frame);
  const config = frame.table.config;
  const bbDisplay = ctx.prefs.displayValueStyle === "big-blind" || !!ctx.prefs.showValueAsBB;
  const fmt = (n: number) => formatValue(n, { cents: config.centsMode, style: ctx.prefs.displayValueStyle, bigBlind: blinds.bb });
  const hand = frame.hand;
  const pending = Object.values(frame.players).filter((p) => p.status === "requestedGameIngress");
  const youInfo = frame.players[youId];
  const isOwner = frame.table.ownerId === youId;

  // equity leader (U-Q2: ties are all green)
  let equityMax: number | null = null;
  if (hand?.directToNext) {
    for (const c of Object.values(frame.cards)) {
      if (c.prob1 != null && c.cards.some((s) => s.showing && s.value)) equityMax = Math.max(equityMax ?? 0, Math.round(c.prob1));
    }
  }

  const bySeat = new Map<number, PlayerId>(frame.seats.map(([s, id]) => [s, id]));
  const occupied = bySeat.size;
  const youStatus = youInfo?.status;
  const mayPickSeat = !youSeated && (youStatus === "watching" || youStatus === "requestedGameIngress" || youStatus === undefined) && occupied < TABLE_SEATS;
  const seats: SeatVM[] = [];
  for (let position = 1; position <= TABLE_SEATS; position++) {
    const seatNo = seatForPosition(position, mySeat);
    const pid = bySeat.get(seatNo);
    const info = pid ? frame.players[pid] : undefined;
    seats.push({
      position,
      seatNo,
      player: pid && info ? derivePlayer(frame, pid, ctx, equityMax, fmt) : null,
      canSit: !pid && mayPickSeat,
      viewOnly: !pid && !mayPickSeat && youSeated && frame.table.status === "waiting" && occupied < TABLE_SEATS,
      requestedByYou: !pid && youStatus === "requestedGameIngress" && youInfo?.intendedSeat === seatNo
    });
  }

  const board = deriveBoard(frame, youSeated);

  const dealerSeat = hand?.dealerSeat ?? null;
  const straddleSeat = hand?.straddleId ? seatOf(frame, hand.straddleId) : null;
  const dealer: DealerVM = {
    dealerPosition: hand && dealerSeat != null ? positionForSeat(dealerSeat, mySeat) : null,
    dead: !!hand?.deadButton,
    straddlePosition: straddleSeat != null ? positionForSeat(straddleSeat, mySeat) : null
  };

  let betSum = 0;
  if (hand) for (const b of Object.values(hand.bets)) if (typeof b === "number") betSum += b;
  const pot: PotVM = {
    mainText: fmt(hand?.pot ?? 0),
    totalText: hand && betSum > 0 ? `total ${fmt(hand.pot + betSum)}` : null
  };

  const nextBlind = frame.table.nextBlind;
  const info: InfoVM = {
    ownerName: frame.players[frame.table.ownerId]?.name ?? null,
    typeLabel: "NLH",
    blindsText: `${fmt(blinds.sb)} / ${fmt(blinds.bb)}`,
    anteText: config.antes && blinds.ante ? `(A:${fmt(blinds.ante)})` : null,
    nextBlindText:
      nextBlind && frame.table.nextBlindAt != null
        ? `Next Blind: ${fmt(nextBlind.sb)}/${fmt(nextBlind.bb)}${nextBlind.ante ? ` (A: ${fmt(nextBlind.ante)})` : ""} in ${formatMMSS(frame.table.nextBlindAt - now)}`
        : null // U-G6: break text format
  };

  const seatedCount = Object.values(frame.players).filter((p) => SEATED_STATUSES.includes(p.status)).length;
  const inGameCount = Object.values(frame.players).filter((p) => p.status === "inGame").length;
  const betweenHands = frame.table.status === "inProgress" && frame.result !== null && frame.turn.nextStep === null;
  const canNextHand = isOwner && !config.autoDeal && betweenHands;
  const paused = frame.table.pausedAt != null;
  const owner: OwnerControlsVM = {
    isOwner,
    canStart: isOwner && frame.table.status === "waiting" && inGameCount > 1,
    canNextHand,
    canPause: isOwner && (paused || frame.table.status === "inProgress"),
    paused,
    canStop: isOwner && frame.table.status === "inProgress",
    stopQueued: frame.table.stopQueued,
    pendingRequests: isOwner ? pending.length : 0,
    quickAcceptQueue: isOwner
      ? pending.map((p) => ({ playerId: p.id, name: p.name, stack: p.requestedStack ?? 0, seat: p.intendedSeat ?? 0 }))
      : []
  };

  const spectatorGranted = !youSeated && frame.table.godModeIds.includes(youId);
  const center = centerMessage(frame, now, isOwner, canNextHand, spectatorGranted);

  const action = deriveActionBar(frame, {
    youId,
    intent: ctx.intent,
    lockedUntil: ctx.lockedUntil,
    serverNow: now,
    ownCards: ctx.ownCards && ctx.ownCards.handId === hand?.handId ? ctx.ownCards.cards : [],
    ritLocal: ctx.ritLocal,
    fmt,
    bigBlind: blinds.bb,
    bbMode: bbDisplay
  });

  const you: YouStateVM = {
    status: youInfo?.status ?? null,
    stack: youInfo?.stack ?? 0,
    away: !!youInfo?.away,
    quitQueued: !!youInfo?.quitNextHand || youInfo?.status === "quiting",
    pendingSeat: youStatus === "requestedGameIngress" ? (youInfo?.intendedSeat ?? null) : null,
    straddling: frame.you?.straddling ?? false,
    canLeaveSeat: youSeated,
    canAway: youSeated && youStatus === "inGame",
    isSpectator: spectatorGranted
  };
  const rb = frame.turn.rebuy;
  const rebuy: RebuyVM | null = rb
    ? {
        phase: rb.phase,
        secondsLeft: rb.deadlineAt == null ? null : Math.max(0, Math.floor((rb.deadlineAt - now) / 1000)),
        youDecide: rb.phase === "decision" && youId in rb.requests === false && frame.turn.rebuyPromptIds.includes(youId),
        ownerRequests: isOwner
          ? Object.entries(rb.requests).map(([playerId, requestedStack]) => ({ playerId, name: frame.players[playerId]?.name ?? "", requestedStack }))
          : []
      }
    : null;

  return {
    you,
    configQueued: frame.table.configQueued,
    rebuy,
    orientation: ctx.orientation,
    connection: ctx.connection,
    gameId: frame.meta.id || ctx.gameId,
    youId,
    youSeated,
    seats,
    board,
    dealer,
    pot,
    info,
    center,
    action,
    owner,
    config,
    waitingBanner: isOwner && frame.table.status === "waiting" && seatedCount < 2,
    tableStatus: frame.table.status,
    nextStep: frame.turn.nextStep,
    spectatorCount: Object.values(frame.players).filter((p) => p.spectator && !SEATED_STATUSES.includes(p.status)).length,
    spectatorMode: frame.table.spectatorMode,
    fourColor: ctx.prefs.deckStyle === "four-color",
    bbMode: bbDisplay,
    handNumber: frame.table.handNumber
  };
}

export { startedHand };
