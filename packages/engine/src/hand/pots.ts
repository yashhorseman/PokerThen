/** Pots, uncalled returns, ordering helpers. */
import type { HandRec, S } from "../state.js";

export interface Pot { amount: number; eligible: string[] }

/** Main/side pots by contribution levels of non-folded players. Sum of amounts === sum of contributions. */
export function computePots(h: HandRec): Pot[] {
  const live = h.participants.filter((id) => h.status[id] !== "fold");
  const levels = [...new Set(live.map((id) => h.contrib[id] ?? 0).filter((x) => x > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (const id of h.participants) { const c = h.contrib[id] ?? 0; amount += Math.min(c, L) - Math.min(c, prev); }
    const eligible = live.filter((id) => (h.contrib[id] ?? 0) >= L);
    if (amount > 0) pots.push({ amount, eligible });
    prev = L;
  }
  const top = levels[levels.length - 1] ?? 0;
  let extra = 0;
  for (const id of h.participants) extra += Math.max(0, (h.contrib[id] ?? 0) - top);
  if (extra > 0 && pots.length) pots[pots.length - 1]!.amount += extra;
  else if (extra > 0) pots.push({ amount: extra, eligible: live });
  return pots;
}

/** Ring of participants (seat order) starting after `id` (id excluded unless it is the only one), optional filter. */
export function ringAfter(h: HandRec, s: S, fromSeat: number): string[] {
  const seatOf = (id: string) => s.players[id]!.seat ?? 0;
  const sorted = [...h.participants].sort((a, b) => seatOf(a) - seatOf(b));
  const after = sorted.filter((id) => seatOf(id) > fromSeat);
  const before = sorted.filter((id) => seatOf(id) <= fromSeat);
  return [...after, ...before];
}

/** If one player's total contribution exceeds every other player's, the excess is uncalled: returns [playerId, amount]. */
export function uncalled(h: HandRec): [string, number] | null {
  let top: string | null = null; let c1 = 0; let c2 = 0;
  for (const id of h.participants) {
    const c = h.contrib[id] ?? 0;
    if (c > c1) { c2 = c1; c1 = c; top = id; } else if (c > c2) c2 = c;
  }
  if (!top || c1 <= c2) return null;
  const amt = Math.min(c1 - c2, h.bets[top] ?? 0);
  return amt > 0 ? [top, amt] : null;
}
