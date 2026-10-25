/**
 * Pacing constants measured on the reference site (real server frames, research/evidence/protocol/spec3.json).
 * The ENGINE owns pacing; clients only animate what the frames tell them.
 */
export const TIMING = {
  /** pause after any bet/check/call/raise/fold before the next actor or the next street (sNA NSAA / NSAF) */
  AFTER_ACTION_MS: 800,
  /** run-it-twice vote window; unanswered = No (NSARD) */
  RIT_VOTE_MS: 10_000,
  /** pause after the vote resolves before the reveal (NSAA) */
  AFTER_VOTE_MS: 800,
  /** hands revealed + equity shown before the first run-out street (NSAAD) */
  ALL_IN_REVEAL_MS: 4_000,
  /** each run-out street (flop, turn, river, then run 2's) is 4s apart */
  RUNOUT_STREET_MS: 4_000,
  /** result display after a hand won without showdown (NSAGR: 2.9s frame hint, next hand dealt ~3.0s after the award) */
  RESULT_NO_SHOWDOWN_MS: 3_000,
  /** award frame comes ~0.8s after the last fold (NSAF) */
  AFTER_FOLD_MS: 800,
  /** showdown presentation time (config) */
  SHOWDOWN_MS: { fast: 3_000, normal: 6_000, slow: 9_000 },
  /** observed: result display after a run-it-twice showdown was 8s with "normal" (6s) -> +2s when 2 runs (single sample: ASSUMPTION) */
  RESULT_TWO_RUNS_EXTRA_MS: 2_000,
  /** pressing Reveal (rabbit hunt) extends the pending next-hand time by ~3s */
  RABBIT_EXTEND_MS: 3_000,
  /** show-hand buttons stay until nextAt - 600ms */
  SHOW_HAND_LEAD_MS: 600,
  /** rebuy decision windows (assumption, unobserved) */
  REBUY_DECISION_MS: 30_000,
  REBUY_APPROVAL_MS: 60_000,
  /** application ping (client -> server) */
  PING_INTERVAL_MS: 20_000,
  /** server drops a socket that did not answer for this long */
  PING_TIMEOUT_MS: 45_000,
  /** client-side debounce after pressing a decision button */
  DECISION_BUTTON_LOCK_MS: 750,
  /** timer bar redraw interval */
  TIMER_REDRAW_MS: 100,
  /** a chat bubble above a player: 2300 + 300*words ms */
  CHAT_BUBBLE_BASE_MS: 2_300,
  CHAT_BUBBLE_PER_WORD_MS: 300,
} as const;

export const LIMITS = {
  NICKNAME_MIN: 2,
  NICKNAME_MAX: 14,
  CHAT_MAX: 100,
  PRESET_NAME_MAX: 15,
  MAX_PRESETS: 5,
  /** ASSUMPTION (server-side limits were never observed): blind/ante/duration fields */
  BLIND_MAX: 1_000_000,
  DURATION_MAX_MIN: 1_000,
  DECISION_TIME_MAX_SEC: 3_600,
  TIME_BANK_MAX_SEC: 3_600,
  REFILL_HANDS_MAX: 1_000,
  MAX_BLIND_LEVELS: 50,
} as const;

export const COOKIE_NAME = 'ptt';
export const CLIENT_VERSION = '1.0.0';
