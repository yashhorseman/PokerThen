export interface Contribution {
  seat: number;
  total: number;
  folded: boolean;
}

export interface PotSlice {
  amount: number;
  eligible: number[];
}

/**
 * Returns the uncalled excess (to refund) and the contestable pots, built from sorted unique
 * contribution levels of players still in the hand. Folded players fund pots but never win them.
 */
export function buildPots(contribs: Contribution[]): { refund: { seat: number; amount: number } | null; pots: PotSlice[]; totals: Map<number, number> } {
  const totals = new Map(contribs.map((c) => [c.seat, c.total]));
  let refund: { seat: number; amount: number } | null = null;

  const sorted = [...contribs].sort((a, b) => b.total - a.total);
  if (sorted.length && sorted[0].total > 0) {
    const second = sorted.length > 1 ? sorted[1].total : 0;
    if (sorted[0].total > second) {
      refund = { seat: sorted[0].seat, amount: sorted[0].total - second };
      totals.set(sorted[0].seat, second);
    }
  }

  const live = contribs.filter((c) => !c.folded && (totals.get(c.seat) as number) > 0);
  const levels = [...new Set(live.map((c) => totals.get(c.seat) as number))].sort((a, b) => a - b);
  const pots: PotSlice[] = [];
  let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    for (const c of contribs) amount += Math.max(0, Math.min(totals.get(c.seat) as number, lv) - prev);
    pots.push({ amount, eligible: live.filter((c) => (totals.get(c.seat) as number) >= lv).map((c) => c.seat) });
    prev = lv;
  }
  // dead money above the highest live level (only possible if a folded player out-contributed everyone live)
  if (pots.length) {
    const left = contribs.reduce((a, c) => a + Math.max(0, (totals.get(c.seat) as number) - prev), 0);
    pots[pots.length - 1].amount += left;
  } else {
    // nobody live contributed (cannot normally happen) — nothing to build
  }
  return { refund, pots, totals };
}

/** Splits `amount` among `winners` (ordered clockwise from the seat left of the dealer); odd chips go first. */
export function splitAmount(amount: number, winners: number[]): Array<{ seat: number; amount: number }> {
  const each = Math.floor(amount / winners.length);
  let rem = amount - each * winners.length;
  return winners.map((seat) => ({ seat, amount: each + (rem-- > 0 ? 1 : 0) }));
}
