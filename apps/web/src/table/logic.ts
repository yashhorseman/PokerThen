/** Pure helpers for the table surface (unit-tested in test/table/logic.test.ts). */

/** Name auto-shrink (SPEC 4.5): overflow = scrollWidth - offsetWidth measured at the default size. */
export function nameShrinkClass(overflowPx: number): "" | "shrink-1" | "shrink-2" | "shrink-3" {
  if (overflowPx > 30) return "shrink-3";
  if (overflowPx > 10) return "shrink-2";
  if (overflowPx > 0) return "shrink-1";
  return "";
}

/** Chat bubble text: truncated to 30 chars + ellipsis (SPEC 4.5). */
export function truncateBubble(text: string): string {
  return text.length > 30 ? text.slice(0, 30) + "…" : text;
}

export const BUBBLE_LIFETIME_MS = 7200; // U-C1 placeholder (VM supplies `until`)

export interface TimerInput {
  actionStartedAt: number;
  deadlineNoBank: number;
  deadlineWithBank: number;
}
export interface TimerSegments {
  /** width in % of the bar */
  bankPct: number;
  normalPct: number;
  bankRed: boolean;
  normalRed: boolean;
  /** consumed share of the regular / bank segment, 0..100 */
  regularConsumed: number;
  bankConsumed: number;
}

/** Turn timer math (SPEC 7.3). */
export function timerSegments(t: TimerInput, now: number, offline = false): TimerSegments {
  const total = Math.max(1, t.deadlineWithBank - t.actionStartedAt);
  const bank = Math.max(0, t.deadlineWithBank - t.deadlineNoBank);
  const regular = Math.max(1, total - bank);
  const elapsed = Math.max(0, now - t.actionStartedAt);
  if (offline) {
    // U-T6: offline actor bar = one green segment running to the limit
    const left = Math.max(0, (t.deadlineNoBank - now) / Math.max(1, t.deadlineNoBank - t.actionStartedAt)) * 100;
    return { bankPct: 0, normalPct: left, bankRed: false, normalRed: false, regularConsumed: 100 - left, bankConsumed: 0 };
  }
  const regularConsumed = (Math.min(elapsed, regular) / regular) * 100;
  const bankConsumed = bank > 0 ? ((elapsed > regular ? elapsed - regular : 0) / bank) * 100 : 0;
  const shareNormal = (regular / total) * 100;
  const shareBank = (bank / total) * 100;
  const bankC = Math.min(100, bankConsumed);
  return {
    bankPct: shareBank * (100 - bankC) / 100,
    normalPct: shareNormal * (100 - regularConsumed) / 100,
    bankRed: bank > 0 && bankConsumed > 70,
    normalRed: regularConsumed > 70,
    regularConsumed,
    bankConsumed: bankC
  };
}

/** REVEAL bar geometry in rem (SPEC 14): width 4.61n + .29(n-1) + .5, left of the first missing slot -.25. */
export function rabbitBarWidthRem(n: number): number {
  return 4.61 * n + 0.29 * (n - 1) + 0.5;
}
export const BOARD_SLOT_PITCH_REM = 4.9; // 4.5 card + .4 margin
export function rabbitBarLeftRem(existingCards: number): number {
  return existingCards * BOARD_SLOT_PITCH_REM - 0.25;
}

/** Replace the first integer in a countdown text with the locally ticking value. */
export function withCountdown(text: string, seconds: number): string {
  return text.replace(/\d+/, String(Math.max(0, seconds)));
}

/** Cards that still have to be flipped, staggered 150 ms (SPEC 4.8). */
export const FLIP_STAGGER_MS = 150;
export const FLIP_POLL_MS = 50;

/** Dealer disc position slot class. */
export const slotClass = (prefix: string, pos: number): string => `${prefix}-${pos}`;
