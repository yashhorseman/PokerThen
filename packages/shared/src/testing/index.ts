import type { Entropy } from "../engineApi.js";
import type { CardCode } from "../cards.js";
import { CANONICAL_DECK } from "../cards.js";
import type { Frame, HandView, PlayerInfo, SeatNo, TurnView } from "../frame.js";
import { defaultGameConfig } from "../config.js";
import { GENESIS_PREV_COMMITMENT } from "../fairness.js";

/**
 * Scripted entropy: serves the given 32-bit words (big-endian, 4 bytes each) in order; throws when exhausted so tests
 * notice unexpected extra draws. Use `fixedUint32s` for crafted rejection-sampling cases.
 */
export function scriptedEntropy(words: readonly number[]): Entropy {
  let pos = 0; let buf: number[] = [];
  return (n) => {
    while (buf.length < n) {
      if (pos >= words.length) throw new Error("scriptedEntropy exhausted");
      const w = words[pos++]! >>> 0;
      buf.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);
    }
    const out = Uint8Array.from(buf.slice(0, n)); buf = buf.slice(n); return out;
  };
}

/** Deterministic non-cryptographic entropy (mulberry32) for property tests ONLY. */
export function seededEntropy(seed: number): Entropy {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0); };
  return (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i += 4) { const w = next(); for (let k = 0; k < 4 && i + k < n; k++) out[i + k] = (w >>> (24 - 8 * k)) & 255; } return out; };
}

export interface FakeClock { now(): number; advance(ms: number): number; set(ms: number): void }
export function fakeClock(start = 1_800_000_000_000): FakeClock {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms), set: (ms) => { t = ms; } };
}

/** Deck that starts with `top` (in order) followed by the remaining canonical cards, for controlled deals. */
export function stackedDeck(top: readonly CardCode[]): CardCode[] {
  if (new Set(top).size !== top.length) throw new Error("duplicate card in stackedDeck");
  return [...top, ...CANONICAL_DECK.filter((c) => !top.includes(c))];
}

type PlainObject = Record<string, unknown>;
const isObj = (v: unknown): v is PlainObject => typeof v === "object" && v !== null && !Array.isArray(v);
/** Recursive merge: objects merge, arrays/scalars replace, `undefined` is skipped. */
export function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: PlainObject = { ...base };
  for (const k of Object.keys(over)) if (over[k] !== undefined) out[k] = isObj(out[k]) && isObj(over[k]) ? deepMerge(out[k], over[k]) : over[k];
  return out as T;
}
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export const FIXTURE_NOW = 1_800_000_000_000;

export function makePlayer(id: string, name: string, stack = 1000, extra: Partial<PlayerInfo> = {}): PlayerInfo {
  return { id, name, status: "inGame", stack, winCount: 0, quitCount: 0, ...extra };
}
export function makeTurn(over: DeepPartial<TurnView> = {}): TurnView {
  return deepMerge<TurnView>({ playerId: null, taking: null, actionStartedAt: null, deadlineNoBank: null, deadlineWithBank: null, nextStep: null, nextStepAt: null, bankMs: {}, ritWaiting: false, ritVotes: {}, rebuyPromptIds: [] }, over);
}
export function makeHand(over: DeepPartial<HandView> = {}): HandView {
  return deepMerge<HandView>({
    handNumber: 1, handId: "hand0001", commitment: "c".repeat(64), dealerSeat: 1, deadButton: false, dealerId: null,
    smallBlindId: null, bigBlindId: null, straddleId: null, inHandIds: [], playerStatus: {}, street: { run: 1, stage: 0 },
    runs: 1, board: { "1": [] }, pot: 0, bets: {}, highestBet: 0, minRaise: 0, maxBet: null, optionIds: [], noReraiseIds: [],
    bigBlindChecked: false, directToNext: false, winningBoardCards: null
  }, over);
}

/** Frame builder: waiting table, owner `p1`, no hand. `players` is [seat|null, id, name, stack][]; seat=null => watching/unseated. */
export type FrameInput = DeepPartial<Frame> & { _players?: Array<[SeatNo | null, string, string, number]> };
export function makeFrame(over: FrameInput = {}): Frame {
  const { _players, ...rest } = over;
  const players: Record<string, PlayerInfo> = {}; const seats: Array<[SeatNo, string]> = [];
  for (const [seat, id, name, stack] of _players ?? [[1, "p1", "Alice", 1000]]) {
    players[id] = makePlayer(id, name, stack, seat === null ? { status: "watching" } : {}); if (seat !== null) seats.push([seat, id]);
  }
  const base: Frame = {
    meta: { id: "fixture1", now: FIXTURE_NOW, pre: FIXTURE_NOW - 1, sN: FIXTURE_NOW, version: "0.1.0", mEV: 0 },
    table: { status: "waiting", ownerId: "p1", pausedAt: null, stopQueued: false, handNumber: 0, configQueued: false, config: defaultGameConfig(), nextBlindAt: null, nextBlind: null, spectatorMode: false, godModeIds: [], waitingMessage: null, blinds: { sb: 10, bb: 20, ante: null, level: 1 }, spectatorCount: 0 },
    seats, players, hand: null, turn: makeTurn(), cards: {}, result: null, rabbit: { enabled: false, hunters: [], cards: null },
    you: { id: "p1", name: "Alice", mutedIds: [], straddling: false, isOwner: true }
  };
  return deepMerge(base, rest);
}
export { GENESIS_PREV_COMMITMENT };
