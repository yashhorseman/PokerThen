import { Config, DEFAULT_CONFIG } from './types';

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);

/** Validates a full config. Returns a map of field → message (empty = valid). Enforced on server and mirrored in the UI. */
export function validateConfig(c: Config): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isInt(c.sb) || c.sb < 1) e.sb = 'Small blind must be a whole number of at least 1.';
  if (!isInt(c.bb) || c.bb < 1) e.bb = 'Big blind must be a whole number of at least 1.';
  if (isInt(c.sb) && isInt(c.bb) && c.sb > c.bb) e.sb = 'Small blind cannot exceed the big blind.';
  if ((isInt(c.bb) && c.bb > 1e9) || (isInt(c.sb) && c.sb > 1e9)) e.bb = 'Blinds are too large.';
  if (!isInt(c.ante) || c.ante < 0 || c.ante > 1e9) e.ante = 'Ante must be a whole number, 0 or more.';
  if (typeof c.autoStartNext !== 'boolean') e.autoStartNext = 'Choose yes or no.';
  if (![3000, 6000, 9000].includes(c.showdownMs)) e.showdownMs = 'Showdown display must be fast (3s), normal (6s) or slow (9s).';
  if (c.actionSeconds !== null && (!isInt(c.actionSeconds) || c.actionSeconds < 1 || c.actionSeconds > 600)) e.actionSeconds = 'Decision time must be 1–600 seconds, or unlimited.';
  if (!isInt(c.bankSeconds) || c.bankSeconds < 0 || c.bankSeconds > 3600) e.bankSeconds = 'Time bank must be 0–3600 seconds.';
  if (c.actionSeconds === null && c.bankSeconds !== 0) e.bankSeconds = 'The time bank needs a decision time limit.';
  if (!isInt(c.bankRefillHands) || c.bankRefillHands < 1 || c.bankRefillHands > 1000) e.bankRefillHands = 'Refill must be every 1–1000 hands.';
  if (typeof c.revealWhenNoAction !== 'boolean') e.revealWhenNoAction = 'Choose yes or no.';
  if (typeof c.rabbit !== 'boolean') e.rabbit = 'Choose yes or no.';
  if (!['off', 'ask', 'always'].includes(c.runTwice)) e.runTwice = 'Choose off, ask players or always.';
  if (typeof c.guestChat !== 'boolean') e.guestChat = 'Choose yes or no.';
  return e;
}

/** Merge a partial patch onto a config; unknown keys are ignored. */
export function mergeConfig(base: Config, patch: Partial<Config>): Config {
  const out: Config = { ...base };
  for (const k of Object.keys(DEFAULT_CONFIG) as Array<keyof Config>) {
    if (k in patch && patch[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = patch[k];
  }
  return out;
}
