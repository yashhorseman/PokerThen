import type { ActionBarVM, CardCode, Frame, PlayerId } from "@pokerthen/shared";
import type { Intent } from "../store/intent";
import { isFreeCheck, isYourTurn, numericBet } from "../store/intent";
import { isSeated } from "./rotation";

export interface ActionBarCtx {
  youId: PlayerId;
  intent: Intent | null;
  lockedUntil: number;
  serverNow: number;
  /** own hole cards (kept after folding) */
  ownCards: CardCode[];
  ritLocal: boolean | null;
  fmt: (n: number) => string;
  bigBlind: number;
  bbMode: boolean;
}

/** All of the viewer's hole cards and which of them are already showing to everyone. */
function ownCards(frame: Frame, youId: PlayerId, memory: CardCode[]): { all: CardCode[]; shown: CardCode[] } {
  const slots = frame.cards[youId]?.cards ?? [];
  const showing = new Set(slots.filter((s) => s.showing && s.value).map((s) => s.value as CardCode));
  const all = slots.length ? slots.map((s) => s.value).filter((v): v is CardCode => !!v) : memory;
  return { all, shown: all.filter((c) => showing.has(c)) };
}

export const HIDDEN_ACTION_BAR: ActionBarVM = Object.freeze({
  visible: false,
  yourTurn: false,
  low: true,
  call: null,
  raise: { label: "Bet", enabled: false, highlighted: false },
  check: { enabled: false, highlighted: false },
  fold: { enabled: false, highlighted: false, needsConfirmation: false },
  checkOrFold: { visible: false, highlighted: false },
  timeBank: { visible: false, activated: false, secondsLeft: 0 },
  lockedUntil: 0,
  iAmBack: false,
  cancelIngress: false,
  showHand: null,
  rit: null
}) as ActionBarVM;

/** SPEC 6.1 / 6.2 / 12.3 / 13.2 button rules. */
export function deriveActionBar(frame: Frame, c: ActionBarCtx): ActionBarVM {
  const { youId } = c;
  const hand = frame.hand;
  const me = frame.players[youId];
  const seated = isSeated(frame, youId);
  const paused = frame.table.pausedAt != null;
  const base: ActionBarVM = {
    ...HIDDEN_ACTION_BAR,
    lockedUntil: c.lockedUntil,
    iAmBack: !!me?.away && seated,
    cancelIngress: me?.status === "requestedGameIngress"
  };

  // show-hand group (12.3)
  let showHand: ActionBarVM["showHand"] = null;
  if (seated && me?.status === "inGame" && hand) {
    const atResult = frame.result !== null;
    const runOut = hand.directToNext && !frame.turn.ritWaiting;
    const { all: cards, shown } = ownCards(frame, youId, c.ownCards);
    if ((atResult || runOut) && cards.length) {
      const autoDeal = frame.table.config.autoDeal;
      const next = frame.turn.nextStepAt;
      const until = autoDeal && next != null ? next - 600 : Number.POSITIVE_INFINITY;
      if (c.serverNow <= until) showHand = { visible: true, until, cards, shown };
    }
  }

  // run-it-twice prompt (13.2)
  let rit: ActionBarVM["rit"] = null;
  const status = hand?.playerStatus[youId];
  if (frame.turn.ritWaiting && seated && hand && status && status !== "fold") {
    const vote = frame.turn.ritVotes[youId];
    const answered = vote ?? c.ritLocal ?? null;
    rit = { visible: true, answered };
  }

  const inHand = !!hand && !!status && status !== "fold" && hand.inHandIds.includes(youId);
  const visible = seated && inHand && frame.result === null && !hand!.directToNext;
  if (!visible) return { ...base, showHand, rit };

  const myBet = numericBet(frame, youId);
  const stackTotal = me?.stack ?? 0; // bet-to cap (frame stack excludes nothing already put in this street)
  const remaining = Math.max(0, stackTotal - myBet);
  const highest = hand!.highestBet;
  const allIn = status === "allIn" || remaining === 0;
  const yourTurn = isYourTurn(frame, youId);
  const free = isFreeCheck(frame, youId);
  const i = c.intent;
  const hl = (k: Intent["kind"]) => !!i && i.kind === k;

  let call: ActionBarVM["call"] = null;
  if (!allIn && highest !== myBet && (yourTurn || highest > 0)) {
    const owe = Math.max(0, highest - myBet);
    const isAllIn = owe >= remaining;
    const amount = Math.min(owe, remaining);
    const label =
      owe === 0 ? `Bet ${c.fmt(c.bigBlind)}` : isAllIn ? `All In ${c.fmt(remaining)}` : `Call ${c.fmt(owe)}`;
    call = { label, enabled: true, highlighted: hl("call"), allIn: isAllIn, amount };
  }

  const canReraise = !hand!.noReraiseIds.includes(youId) && stackTotal > highest;
  const bank = frame.turn.bankMs[youId] ?? 0;
  const bankConfigured = frame.table.config.timeBankSec != null;
  const dNo = frame.turn.deadlineNoBank;
  const dWith = frame.turn.deadlineWithBank;
  const activated = yourTurn && dNo != null && dWith != null && dWith !== dNo && frame.turn.nextStepAt === dWith;

  return {
    ...base,
    visible: true,
    yourTurn,
    low: !yourTurn,
    call,
    raise: { label: highest > 0 ? "Raise" : "Bet", enabled: yourTurn && !allIn && canReraise, highlighted: hl("raise") },
    check: { enabled: free || allIn, highlighted: hl("check") },
    fold: { enabled: !allIn, highlighted: hl("fold"), needsConfirmation: !allIn && free },
    checkOrFold: { visible: !yourTurn && !allIn && (highest === 0 || hand!.optionIds.includes(youId)), highlighted: hl("checkOrFold") },
    timeBank: {
      visible: yourTurn && bankConfigured && (bank > 0 || activated) && !paused,
      activated,
      secondsLeft: Math.floor(bank / 1000),
      limitAt: dNo ?? null
    },
    showHand,
    rit
  };
}
