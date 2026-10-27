/**
 * SPEC 6.3 bet-panel math from a raw Frame. `TableViewModel` has no `betPanel` field yet (see
 * docs/requests/w6-betpanel-vm.md); ActionArea prefers `vm.betPanel` when W4 adds it and falls back to this.
 * Stack is the player's total chips for this street (frame stack includes the current-street bet), values are raise-TO totals.
 */
import type { BetPanelVM, Frame, PlayerId } from "@pokerthen/shared";

export function deriveBetPanel(frame: Frame | null, youId: PlayerId, bigBlind: number, showAsBB: boolean): BetPanelVM | null {
  const hand = frame?.hand;
  const me = frame?.players[youId];
  if (!frame || !hand || !me) return null;
  return computeBetPanel({
    stack: me.stack,
    highestBet: hand.highestBet,
    minRaise: hand.minRaise,
    maxBet: hand.maxBet,
    pot: hand.pot,
    otherBets: Object.entries(hand.bets)
      .filter(([id, v]) => id !== youId && typeof v === "number")
      .reduce((s, [, v]) => s + (v as number), 0),
    bigBlind,
    showAsBB
  });
}

export interface BetInputs {
  stack: number;
  highestBet: number;
  minRaise: number;
  maxBet: number | null;
  pot: number;
  /** sum of the numeric current-street bets of the OTHER players */
  otherBets: number;
  bigBlind: number;
  showAsBB: boolean;
}

export function computeBetPanel(i: BetInputs): BetPanelVM {
  const H = i.highestBet || 0;
  const stack = i.stack;
  const P = i.pot + i.otherBets + H; // own bet replaced by H
  const maxAllowed = Math.min(stack, i.maxBet ?? stack);
  const minRaise = Math.min(i.minRaise || i.bigBlind, stack);
  const clampS = (v: number) => Math.max(0, Math.min(Math.floor(v), stack));
  const precise: number[] = [];
  if (H) precise.push(H);
  precise.push(stack <= (H || i.bigBlind) ? stack : H || i.bigBlind);
  if (i.minRaise >= stack) precise.push(stack);
  return {
    stack,
    highestBet: H,
    minRaise,
    maxAllowed,
    bigBlind: i.bigBlind,
    pot: P,
    initialValue: H === 0 ? Math.min(i.bigBlind, stack) : minRaise,
    presets: {
      minRaise,
      half: clampS(H + P / 2),
      threeQuarter: clampS(H + (3 * P) / 4),
      pot: clampS(H + P),
      allIn: stack
    },
    preciseValues: precise,
    submitLabel: (v) => (H === 0 ? "Bet" : v > H ? "Raise" : "Call"),
    isValid: (v) => precise.includes(v) || (v >= minRaise && v <= maxAllowed),
    showAsBB: i.showAsBB
  };
}

/** "10 / 20" or "1,000 / 2,000" or "0.10 / 0.20" (cents mode) -> big blind in chips */
export function bigBlindFromText(blindsText: string, centsMode: boolean): number {
  const parts = blindsText.split("/").map((s) => Number(s.replace(/[^0-9.]/g, "")));
  const bb = parts[parts.length - 1] || 0;
  return centsMode ? Math.round(bb * 100) : bb;
}
