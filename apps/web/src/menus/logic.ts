import type { BlindLevel, GameConfig, LedgerPlayerInfo, PlayerInfo } from "@pokerthen/shared";
import { MAX_PRESETS, PRESET_NAME_MAX, PLACEHOLDERS } from "@pokerthen/shared";
import { FUNCS, S } from "./strings";

/* ---------- log ---------- */
const NAME_RE = /"([^"]*?) @ ([A-Za-z0-9_-]{10})"/g;

export type LogPart = string | { name: string; id: string };
/** Split a raw log line into text and `"Name @ id"` references. */
export function splitLogNames(msg: string): LogPart[] {
  const out: LogPart[] = [];
  let last = 0;
  for (const m of msg.matchAll(NAME_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(msg.slice(last, i));
    out.push({ name: m[1] ?? "", id: m[2] ?? "" });
    last = i + m[0].length;
  }
  if (last < msg.length) out.push(msg.slice(last));
  return out;
}

/** Entry class by regex (SPEC 15.1) plus `entry-fairness` (SPEC 20.5). First match wins. */
export function logEntryClass(msg: string): string {
  if (/^Hand (commitment|reveal)/.test(msg)) return "entry-fairness";
  if (/^-- starting/.test(msg)) return "start-game";
  if (/^(flop:|turn:|river:)/i.test(msg)) return "entry-street";
  if (/ collected \d+ from/.test(msg)) return "entry-collect";
  if (/folds$/.test(msg)) return "entry-fold";
  if (/ (raises to|bets|posts a big blind of|posts a small blind of)/.test(msg)) return "entry-raise";
  if (/ checks$/.test(msg)) return "entry-check";
  if (/ calls \d+/.test(msg)) return "entry-call";
  return "";
}

export function parseReveal(msg: string): { text: string; verify: string | null } {
  const m = /^(.*?)\.? Verify$/.exec(msg);
  return m ? { text: m[1] + ".", verify: "Verify" } : { text: msg, verify: null };
}

/** Cache of finished hands, max 50 (insertion order eviction). */
export class HandCache<T> {
  private m = new Map<number, T>();
  constructor(private max = 50) {}
  get(k: number): T | undefined {
    return this.m.get(k);
  }
  has(k: number): boolean {
    return this.m.has(k);
  }
  set(k: number, v: T): void {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as number);
  }
  get size(): number {
    return this.m.size;
  }
}

/* ---------- ledger ---------- */
export type LedgerCol = "name" | "buyInSum" | "buyOutSum" | "inGame" | "net";
export interface SortState {
  col: LedgerCol;
  dir: "desc" | "asc";
}
export const DEFAULT_SORT: SortState = { col: "net", dir: "desc" };
export function toggleSort(s: SortState, col: LedgerCol): SortState {
  return s.col === col ? { col, dir: s.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" };
}
export function sortLedger(rows: LedgerPlayerInfo[], s: SortState): LedgerPlayerInfo[] {
  const k = (r: LedgerPlayerInfo) => (s.col === "name" ? r.name.toLowerCase() : (r[s.col] as number));
  return [...rows].sort((a, b) => {
    const x = k(a);
    const y = k(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return s.dir === "desc" ? -c : c;
  });
}
export const arrow = (s: SortState, col: LedgerCol) => (s.col !== col ? "" : s.dir === "desc" ? "↓" : "↑");
export const netText = (n: number) => (n > 0 ? `+${n}` : String(n));
export const MOVEMENT_LABEL: Record<string, string> = {
  tookSeat: "Took a Seat",
  quit: "Left the Seat",
  addStack: "Add-on",
  removed: "Removed",
  resetStack: "Reset Stack"
};

/* ---------- players list ---------- */
export function playerStatusText(p: PlayerInfo): string {
  switch (p.status) {
    case "requestedGameIngress":
      return FUNCS.requestedIngress(p.intendedSeat ?? 0);
    case "waitingNextGameToEnter":
      return S.waitingNext;
    case "quiting":
      return S.willQuit;
    case "watching":
      return S.watching;
    case "standingUp":
      return S.away;
    case "inGame":
      return p.quitNextHand ? S.willQuit : p.away ? S.away : FUNCS.playingWith(p.stack);
    default:
      return S.watching;
  }
}
const rank = (p: PlayerInfo) => (p.status === "requestedGameIngress" ? 0 : p.status === "watching" ? 2 : 1);
/** pending requests first, then seated, then watchers (stable). */
export function orderPlayers(players: Record<string, PlayerInfo>): PlayerInfo[] {
  return Object.values(players)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((x) => x.p);
}

/* ---------- config editing ---------- */
export const digitsOnly = (v: string) => v.replace(/\D+/g, "");
export const toIntOrNull = (v: string): number | null => {
  const d = digitsOnly(v);
  return d === "" ? null : Number(d);
};

export function addLevel(levels: BlindLevel[], antes: boolean): BlindLevel[] {
  const last = levels[levels.length - 1];
  const next = [...levels];
  // penultimate gets the duration prompt; the new last stays infinite
  next.push({ sb: last ? last.sb * 2 : 10, bb: last ? last.bb * 2 : 20, ante: antes ? (last?.ante ?? 0) : null, durationMin: null });
  return next;
}
export function removeLevel(levels: BlindLevel[], i: number): BlindLevel[] {
  if (i <= 0 || levels.length <= 1) return levels;
  const next = levels.filter((_, k) => k !== i);
  next[next.length - 1] = { ...(next[next.length - 1] as BlindLevel), durationMin: null };
  return next;
}
export function setAntes(levels: BlindLevel[], on: boolean): BlindLevel[] {
  return levels.map((l) => ({ ...l, ante: on ? l.ante ?? 0 : null }));
}

export interface Preset {
  name: string;
  config: GameConfig;
}
export type PresetResult = { ok: true; presets: Preset[] } | { ok: false; error: string };
export function addPreset(presets: Preset[], name: string, config: GameConfig): PresetResult {
  const n = name.trim().slice(0, PRESET_NAME_MAX);
  if (presets.length >= MAX_PRESETS) return { ok: false, error: S.presetMax };
  if (!n) return { ok: false, error: S.presetNoName };
  if (presets.some((p) => p.name === n)) return { ok: false, error: S.presetDup };
  return { ok: true, presets: [...presets, { name: n, config }] };
}
/** Apply ignores blinds/countdown when structure is locked and never changes cents mode when locked. */
export function applyPreset(current: GameConfig, preset: GameConfig, structureLocked: boolean, centsLocked: boolean): GameConfig {
  const next: GameConfig = { ...preset };
  if (structureLocked) {
    next.blindLevels = current.blindLevels;
    next.countdownMode = current.countdownMode;
    next.blindResetLevel = current.blindResetLevel;
  }
  if (centsLocked) next.centsMode = current.centsMode;
  return next;
}
export function loadPresets(): Preset[] {
  try {
    const v = JSON.parse(localStorage.getItem("presets") ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function savePresets(p: Preset[]): void {
  try {
    localStorage.setItem("presets", JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Client-side form checks (server remains authority; limits are U-G3 placeholders). */
export function validateConfig(c: GameConfig, runningMultiLevel: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (runningMultiLevel && c.blindLevels.length > 1 && c.blindResetLevel == null) e.blindResetLevel = S.chooseResetError;
  c.blindLevels.forEach((l, i) => {
    if (l.sb < PLACEHOLDERS.BLIND_MIN || l.sb > PLACEHOLDERS.BLIND_MAX) e[`sb${i}`] = PLACEHOLDERS.FIELD_ERROR;
    if (l.bb < PLACEHOLDERS.BLIND_MIN || l.bb > PLACEHOLDERS.BLIND_MAX) e[`bb${i}`] = PLACEHOLDERS.FIELD_ERROR;
  });
  return e;
}

/** Name to pre-fill in the sit popover (previous name for this cookie). */
export function prefillName(name: string | undefined): string {
  return !name || name === S.guest ? "" : name.slice(0, 14);
}
export function parseStack(v: string): number | null {
  const d = digitsOnly(v);
  return d === "" ? null : Number(d);
}
