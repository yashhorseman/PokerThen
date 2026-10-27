import type { BetPanelVM, Frame, PlayerId } from "@pokerthen/shared";

export interface BetPanelInput {
  stack: number;
  highestBet: number;
  minRaise: number;
  maxBet: number | null;
  bigBlind: number;
  pot: number;
  showAsBB: boolean;
}

/** SPEC 6.3 bet-panel math. `stack` is the bet-to cap (chips behind plus chips already bet this street). */
export function computeBetPanel(i: BetPanelInput): BetPanelVM {
  const H = i.highestBet;
  const stack = i.stack;
  const P = i.pot;
  const clampStack = (v: number) => Math.max(0, Math.min(Math.floor(v), stack));
  const presets = {
    minRaise: Math.min(i.minRaise, stack),
    half: clampStack(H + P / 2),
    threeQuarter: clampStack(H + (3 * P) / 4),
    pot: clampStack(H + P),
    allIn: stack
  };
  const opening = H || i.bigBlind;
  const precise = new Set<number>();
  if (H > 0) precise.add(H);
  precise.add(stack <= opening ? stack : opening);
  if (i.minRaise >= stack) precise.add(stack);
  const maxAllowed = i.maxBet == null ? stack : Math.min(stack, i.maxBet);
  const preciseValues = [...precise];
  return {
    stack,
    highestBet: H,
    minRaise: i.minRaise,
    maxAllowed,
    bigBlind: i.bigBlind,
    pot: P,
    initialValue: H > 0 ? Math.min(i.minRaise, stack) : Math.min(i.bigBlind, stack),
    presets,
    preciseValues,
    submitLabel: (value) => (H === 0 ? "Bet" : value > H ? "Raise" : "Call"),
    isValid: (value) => Number.isFinite(value) && (preciseValues.includes(value) || (i.minRaise <= value && value <= maxAllowed)),
    showAsBB: i.showAsBB
  };
}

/** P = pot + sum of numeric current-street bets with your own replaced by the highest bet H. */
export function potForPresets(frame: Frame, youId: PlayerId): number {
  const hand = frame.hand;
  if (!hand) return 0;
  let sum = 0;
  for (const [id, b] of Object.entries(hand.bets)) if (id !== youId && typeof b === "number") sum += b;
  return hand.pot + sum + hand.highestBet;
}

/** Non-null while you are in the hand with chips behind (the panel can open on your turn). */
export function deriveBetPanel(frame: Frame, youId: PlayerId, bigBlind: number, showAsBB: boolean): BetPanelVM | null {
  const hand = frame.hand;
  const me = frame.players[youId];
  if (!hand || !me || frame.result !== null) return null;
  const status = hand.playerStatus[youId];
  if (status !== "inGame" || frame.turn.taking !== youId) return null;
  return computeBetPanel({
    stack: me.stack,
    highestBet: hand.highestBet,
    minRaise: hand.minRaise,
    maxBet: hand.maxBet,
    bigBlind,
    pot: potForPresets(frame, youId),
    showAsBB
  });
}
