/**
 * Timings, limits and PLACEHOLDERS. Values tagged SPEC come from research; PLACEHOLDER entries stand in for
 * SPEC section 22 unknowns and must be changed here only (single swap point).
 */
export const PROTOCOL_VERSION = "0.1.0";

export const TABLE_SEATS = 10;
export const NAME_MIN = 2; // SPEC 2.3
export const NAME_MAX = 14;
export const STACK_MIN = 1;
export const STACK_MAX = 1_000_000;
export const CHAT_MAX = 100;
export const PRESET_NAME_MAX = 15;
export const MAX_PRESETS = 5;

export const GAME_ID_PREFIX = "ptl"; // SPEC 1.4 (reference "pgl")
export const GAME_ID_LENGTH = 24;
export const PLAYER_ID_LENGTH = 10;
export const HAND_ID_LENGTH = 12;

export const DEFAULT_SB = 10;
export const DEFAULT_BB = 20;
export const DEFAULT_STACK = 1000;

/** Timings in ms (SPEC 7.2). */
export const T = {
  ACTION_GAP: 800, // sNAA after an action (NSAA / NSAF)
  DEADLINE_CORRECTION: 280, // third frame after an action
  FOLD_WIN_TO_NEXT_HAND: 3000, // NSAGR
  ALL_IN_REVEAL: 4000, // NSAAD
  RIT_VOTE_WINDOW: 10_000, // NSARD
  RUNOUT_STREET: 4000, // SPEC C4 / U-T3 placeholder for single run
  RUNOUT_TO_AWARD: 3900,
  RUNOUT_AWARD_TO_NEXT_HAND: 8070, // U-T4
  SHOWDOWN_PRESENTATION: { fast: 3000, normal: 6000, slow: 9000 },
  RABBIT_EXTENSION: 3000,
  SHOWDOWN_AWARD_DELAY: 850,
  FOLD_WIN_AWARD_DELAY: 790,
  ACTION_BUTTON_LOCK: 750, // client
  CARD_FLIP_STAGGER: 150,
  CARD_FLIP_POLL: 50,
  TIMER_REDRAW: 100,
  WARNING_BEEP_FRACTION: 0.7,
  CHAT_BUBBLE: 7200, // U-C1 placeholder
  APP_PING: 20_000,
  PONG_TIMEOUT: 5000,
  RECONNECT_MIN: 1000,
  RECONNECT_MAX: 5000,
  CONNECT_TIMEOUT: 20_000,
  KEEPALIVE_FRAME_MIN: 4000,
  KEEPALIVE_FRAME_MAX: 20_000,
  COPIED_LABEL: 2000,
  LONG_PRESS: 500,
  OPTIONS_NOTICE_AUTOCLOSE: 15_000
} as const;

/** Default table configuration values (SPEC 10). */
export const CONFIG_DEFAULTS = {
  decisionLimitSec: 20,
  timeBankSec: 10,
  timeBankFillHands: 10
} as const;

/** PLACEHOLDERS for SPEC 22 unknowns. */
export const PLACEHOLDERS = {
  /** U-G3 */
  BLIND_MIN: 1,
  BLIND_MAX: 1_000_000,
  DURATION_MIN: 1,
  DURATION_MAX: 999,
  LIMIT_MIN: 1,
  LIMIT_MAX: 999,
  /** U-J2 */
  START_GAME_ERROR: "Not enough players to start the game.",
  /** U-G2 */
  FIELD_ERROR: "invalid value",
  /** U-R1 */
  REBUY_DECISION_SEC: 30,
  REBUY_APPROVAL_SEC: 30,
  /** U-D5 */
  ODD_CHIP_RULE: "first-left-of-dealer-run1-gets-extra",
  /** U-T6 */
  OFFLINE_TIME_BANK_SEC: 30,
  /** U-Q1 */
  EQUITY_MONTE_CARLO_RUNS: 200_000,
  /** U-E1 */
  EMOJI: ["\u{1F600}", "\u{1F602}", "\u{1F60E}", "\u{1F62D}", "\u{1F621}", "\u{1F44D}", "\u{1F914}", "\u{1F389}"],
  /** U-C3 */
  CHAT_DISABLED_TOOLTIP: "Chat is disabled by the table owner."
} as const;

export const CONNECTION_ERRORS = {
  default: "Please check if the cookies are enabled and try again.",
  "too-many-connections":
    "Your IP reached the max quantity of connections, please try to finish some other browser tabs/windows.",
  "session-missing-token": "Wasn't possible to detect your session. Please check if the cookies are enabled and try again.",
  "too-many-actions": "You were disconnected because you sent too many actions."
} as const;

export const FIELD_ERRORS = {
  nameInvalid: "must be unique and length must be between 2 and 14",
  nameTaken: "must be unique on this game",
  stackRange: "must be a value between 1 and 1.000.000"
} as const;

/** Additive (W1 review): per-button throttles in ms (SPEC 6.1). */
export const THROTTLE_MS = { yesNo: 190, away: 300, leave: 200, pause: 400, nextHand: 400, actionLock: 750 } as const;

/** Additive (W1 review): limits quoted in SPEC. */
export const LIMITS = {
  LOG_CACHE_HANDS: 50, // SPEC 15.1
  LOG_CSV_MAX_LINES: 20_000, // SPEC 15.1
  BUBBLE_MAX_CHARS: 30, // SPEC 4.5
  BLIND_INPUT_MAX_LEN: 6, // SPEC 10.1
  PRESETS_MAX: 5,
  CHAT_RECENT_KEPT: 200 // ARCH 7
} as const;
