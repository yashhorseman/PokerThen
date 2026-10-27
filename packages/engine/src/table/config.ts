import { PLACEHOLDERS, type FieldErrors, type GameConfig } from "@pokerthen/shared";
import { handRunning, type S } from "../state.js";

/** Config validation (U-G3 ranges are placeholders; U-G2 message placeholder). Returns field errors or null. */
export function validateConfig(s: S, c: GameConfig): FieldErrors | null {
  const e: FieldErrors = {};
  const bad = PLACEHOLDERS.FIELD_ERROR;
  const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
  if (!Array.isArray(c.blindLevels) || c.blindLevels.length < 1 || c.blindLevels.length > 100) e.blindLevels = bad;
  else {
    c.blindLevels.forEach((l, i) => {
      if (!int(l.sb, PLACEHOLDERS.BLIND_MIN, PLACEHOLDERS.BLIND_MAX) || !int(l.bb, PLACEHOLDERS.BLIND_MIN, PLACEHOLDERS.BLIND_MAX)) e.blindLevels = bad;
      if (c.antes && l.ante !== null && !int(l.ante, 0, PLACEHOLDERS.BLIND_MAX)) e.blindLevels = bad;
      const last = i === c.blindLevels.length - 1;
      if (!last && !int(l.durationMin, PLACEHOLDERS.DURATION_MIN, PLACEHOLDERS.DURATION_MAX)) e.blindLevels = bad;
      if (last && l.durationMin !== null && !int(l.durationMin, PLACEHOLDERS.DURATION_MIN, PLACEHOLDERS.DURATION_MAX)) e.blindLevels = bad;
    });
  }
  if (c.variant !== "th") e.variant = bad;
  if (!["always", "ask_players", "no"].includes(c.runItTwice)) e.runItTwice = bad;
  if (!["fast", "normal", "slow"].includes(c.showdownTime)) e.showdownTime = bad;
  if (c.decisionLimitSec !== null && !int(c.decisionLimitSec, PLACEHOLDERS.LIMIT_MIN, PLACEHOLDERS.LIMIT_MAX)) e.decisionLimitSec = bad;
  if (c.timeBankSec !== null && !int(c.timeBankSec, 1, 999)) e.timeBankSec = bad;
  if (c.timeBankFillHands !== null && !int(c.timeBankFillHands, 1, 999)) e.timeBankFillHands = bad;
  if (c.centsMode !== s.config.centsMode && s.handNumber > 0) e.centsMode = bad; // disabled once the game exists
  // U-G4: SPEC says 'only while nobody is seated' but the owner is seated from creation, so the engine requires the table to be stopped/waiting
  if (c.spectatorMode && !s.config.spectatorMode && s.status !== "waiting") e.spectatorMode = bad;
  if (c.blindResetLevel !== null && !int(c.blindResetLevel, 1, c.blindLevels?.length ?? 1)) e.blindResetLevel = bad;
  void handRunning;
  return Object.keys(e).length ? e : null;
}

/** Normalise dependent fields: no limit => no bank/refill; no bank => no refill. */
export function normaliseConfig(c: GameConfig): GameConfig {
  const n = JSON.parse(JSON.stringify(c)) as GameConfig;
  if (n.decisionLimitSec === null) { n.timeBankSec = null; n.timeBankFillHands = null; }
  if (n.timeBankSec === null) n.timeBankFillHands = null;
  if (n.blindLevels.length > 0) n.blindLevels[n.blindLevels.length - 1]!.durationMin = n.blindLevels.length === 1 ? null : n.blindLevels[n.blindLevels.length - 1]!.durationMin;
  return n;
}
