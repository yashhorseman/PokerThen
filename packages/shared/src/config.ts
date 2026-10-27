import { CONFIG_DEFAULTS, DEFAULT_BB, DEFAULT_SB } from "./constants.js";

export type RunItTwiceMode = "always" | "ask_players" | "no";
export type ShowdownPresentation = "fast" | "normal" | "slow";
export type CountdownMode = "s" | "c";

export interface BlindLevel {
  sb: number;
  bb: number;
  ante: number | null;
  /** minutes; null = infinite (last level) */
  durationMin: number | null;
}

/** The owner-editable table configuration (SPEC 10). Sent whole in POST update_game. */
export interface GameConfig {
  blindLevels: BlindLevel[];
  antes: boolean;
  variant: "th";
  centsMode: boolean;
  rabbitHunt: boolean;
  runItTwice: RunItTwiceMode;
  straddleAllowed: boolean;
  autoDeal: boolean;
  showdownTime: ShowdownPresentation;
  dealToAway: boolean;
  /** seconds; null = no limit */
  decisionLimitSec: number | null;
  /** seconds; null = no time bank */
  timeBankSec: number | null;
  timeBankFillHands: number | null;
  revealAllWhenNoAction: boolean;
  spectatorMode: boolean;
  allowRebuy: boolean;
  guestChat: boolean;
  recordChat: boolean;
  autoTrimBets: boolean;
  /** only meaningful with >1 blind level while running */
  countdownMode: CountdownMode;
  /** level index (1-based) to restart the blind clock at, null = not chosen */
  blindResetLevel: number | null;
}

export function defaultGameConfig(sb = DEFAULT_SB, bb = DEFAULT_BB): GameConfig {
  return {
    blindLevels: [{ sb, bb, ante: null, durationMin: null }],
    antes: false,
    variant: "th",
    centsMode: false,
    rabbitHunt: false,
    runItTwice: "no",
    straddleAllowed: false,
    autoDeal: true,
    showdownTime: "normal",
    dealToAway: false,
    decisionLimitSec: CONFIG_DEFAULTS.decisionLimitSec,
    timeBankSec: CONFIG_DEFAULTS.timeBankSec,
    timeBankFillHands: CONFIG_DEFAULTS.timeBankFillHands,
    revealAllWhenNoAction: true,
    spectatorMode: false,
    allowRebuy: false,
    guestChat: true,
    recordChat: true,
    autoTrimBets: false,
    countdownMode: "s",
    blindResetLevel: null
  };
}

/** Subset of the config every client needs to render (everyone can open Game Configurations read-only, so the full config is public). */
export type PublicConfig = GameConfig;

/** Display names of config fields used in the `Game Config Changes` log block (SPEC 15.2 names seen; others = U-LOG2 placeholders). */
export const CONFIG_LOG_NAMES: Partial<Record<keyof GameConfig, string>> = {
  straddleAllowed: "Allow Straddle",
  allowRebuy: "Allow Rebuy",
  rabbitHunt: "Rabbit Hunt",
  runItTwice: "Allow Run it Twice"
};

export const RIT_LOG_LABEL: Record<RunItTwiceMode, string> = { always: "always", ask_players: "ask players", no: "no" };
