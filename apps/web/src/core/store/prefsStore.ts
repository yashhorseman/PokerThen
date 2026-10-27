import { DEFAULT_PREFS, type Prefs, type PrefsApi } from "@pokerthen/shared";
import { lsGet, lsSet } from "../util";

export const PREFS_KEY = "currentPlayer";

export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) return { ...DEFAULT_PREFS, ...(obj as Partial<Prefs>), version: 1 };
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_PREFS };
}

/** Per-device preferences (SPEC 16): localStorage `currentPlayer`, version 1; all changes apply immediately. */
export class PrefsStore implements PrefsApi {
  private prefs: Prefs;
  private readonly subs = new Set<(p: Prefs) => void>();
  constructor(private readonly persist: boolean = true) {
    this.prefs = persist ? parsePrefs(lsGet(PREFS_KEY)) : { ...DEFAULT_PREFS };
  }
  get = (): Prefs => this.prefs;
  set = (patch: Partial<Prefs>): void => {
    const next: Prefs = { ...this.prefs, ...patch, version: 1 };
    // drop keys explicitly set to undefined so JSON stays clean
    for (const k of Object.keys(next) as Array<keyof Prefs>) if (next[k] === undefined) delete next[k];
    this.prefs = next;
    if (this.persist) lsSet(PREFS_KEY, JSON.stringify(next));
    for (const s of [...this.subs]) s(next);
  };
  subscribe = (fn: (p: Prefs) => void): (() => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };
}
