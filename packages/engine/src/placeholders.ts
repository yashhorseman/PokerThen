/**
 * Engine-side placeholders for SPEC 22 unknowns. The shared `PLACEHOLDERS` / `T` constants are re-exported untouched; values that
 * live research (research/08-closing-unknowns.md) resolved after the shared constants were written are overridden HERE with a
 * `live` tag, and values that no source gives are local placeholders with a U-xx id. Swap values in this file only.
 */
import { PLACEHOLDERS, T } from "@pokerthen/shared";

export { PLACEHOLDERS, T };

/** Mutable tuning knobs (tests lower them; production keeps the defaults). */
export const tuning = {
  /** U-Q1: Monte-Carlo runs when exact enumeration would exceed EXACT_ENUMERATION_MAX boards. */
  equityRuns: PLACEHOLDERS.EQUITY_MONTE_CARLO_RUNS as number
};

/** ARCH 6: exact enumeration while the number of remaining boards is <= this. */
export const EXACT_ENUMERATION_MAX = 50_000;

/** Rebuy decision window, seconds. U-R1 resolved live (08 d): the countdown started at 20 s and is shared with the owner-approval phase. */
export const REBUY_WINDOW_SEC = 20;

/** Delay between the last run-it-twice answer and the all-in reveal, ms (07 s1+3: reveal flips at +1.33 s). */
export const RIT_REVEAL_DELAY_MS = 1330;

/** Grace after the no-bank deadline during which a client's auto "activate extra time" (ATB) may still arrive (network latency). U-T5 helper, engine-local. */
export const ATB_GRACE_MS = 1500;

/** Straddle size in big blinds (SPEC 11.2). */
export const STRADDLE_BB = 2;

/** U-T6: offline players are timed out at the with-bank deadline (the bank is auto-applied because no client can press ATB). */
export const OFFLINE_USES_BANK = true;

/** U-D5: odd chips -> first winner left of the dealer; odd run-it-twice halves -> run 1 (live-confirmed 503/502, 08 b). */
export const ODD_CHIP_RULE = PLACEHOLDERS.ODD_CHIP_RULE;

/** Max chat/ledger etc. are server concerns; engine-side limits. */
export const MAX_NAME = 14;
export const MIN_NAME = 2;
export const GUEST_NAME = "Guest";
