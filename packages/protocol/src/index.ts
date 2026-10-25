import { z } from 'zod';
import type { CardProof, Config, HandResults } from '@pokerthen/engine';

export const PROTOCOL_VERSION = 1;

/* ───────────── nickname rules ───────────── */

/** Rejects control characters, zero-width / bidi-override characters and line separators. */
function hasBadChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 32 || (c >= 127 && c <= 159) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
  }
  return false;
}

/** 2–14 characters (grapheme clusters), no control characters or markup. */
export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (hasBadChars(value)) return { ok: false, message: 'Nicknames cannot contain control characters.' };
  if (/[<>]/.test(value)) return { ok: false, message: 'Nicknames cannot contain < or >.' };
  const seg = typeof Intl !== 'undefined' && (Intl as unknown as { Segmenter?: unknown }).Segmenter
    ? [...new (Intl as unknown as { Segmenter: new (l?: string, o?: object) => { segment(s: string): Iterable<unknown> } }).Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length
    : [...value].length;
  if (seg < 2 || seg > 14) return { ok: false, message: 'Nicknames must be 2–14 characters.' };
  return { ok: true, value };
}

/* ───────────── client → server ───────────── */

const int = z.number().int().safe();
const posInt = int.positive();
const seatIx = int.min(0).max(9);
const id = z.string().min(1).max(64);

export const configPatchSchema = z
  .object({
    sb: posInt, bb: posInt, ante: int.min(0),
    autoStartNext: z.boolean(),
    showdownMs: z.union([z.literal(3000), z.literal(6000), z.literal(9000)]),
    actionSeconds: int.min(1).max(600).nullable(),
    bankSeconds: int.min(0).max(3600),
    bankRefillHands: int.min(1).max(1000),
    revealWhenNoAction: z.boolean(),
    rabbit: z.boolean(),
    runTwice: z.enum(['off', 'ask', 'always']),
    guestChat: z.boolean(),
  })
  .partial()
  .strict();

export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('seat.request'), seat: seatIx, nickname: z.string().max(60), stack: posInt, sitOut: z.boolean().default(false) }),
  z.object({ kind: z.literal('seat.cancelRequest') }),
  z.object({ kind: z.literal('topup.request'), amount: posInt }),
  z.object({ kind: z.literal('request.decide'), requestId: id, approve: z.boolean(), stack: posInt.optional() }),
  z.object({ kind: z.literal('seat.leave') }),
  z.object({ kind: z.literal('sit.out'), value: z.boolean(), returnOnBB: z.boolean().optional() }),
  z.object({ kind: z.literal('action'), handId: id, turnId: int.min(0), action: z.enum(['fold', 'check', 'call', 'raise', 'allin']), raiseTo: posInt.optional() }),
  z.object({ kind: z.literal('bank.use'), turnId: int.min(0) }),
  z.object({ kind: z.literal('show'), cards: z.array(z.union([z.literal(0), z.literal(1)])).min(1).max(2) }),
  z.object({ kind: z.literal('rabbit.reveal') }),
  z.object({ kind: z.literal('runout.vote'), yes: z.boolean() }),
  z.object({ kind: z.literal('prefs.set'), ritPref: z.enum(['yes', 'no', 'ask']).optional(), autoBank: z.boolean().optional() }),
  z.object({ kind: z.literal('chat.send'), text: z.string().min(1).max(500) }),
  z.object({ kind: z.literal('admin.start') }),
  z.object({ kind: z.literal('admin.nextHand') }),
  z.object({ kind: z.literal('admin.pause'), value: z.boolean() }),
  z.object({ kind: z.literal('admin.stopAfterHand'), value: z.boolean() }),
  z.object({ kind: z.literal('admin.config'), expectedVersion: int.min(0), patch: configPatchSchema }),
  z.object({ kind: z.literal('admin.cancelPending'), what: z.enum(['config']) }),
  z.object({ kind: z.literal('admin.adjust'), memberId: id, mode: z.enum(['ADD', 'REMOVE', 'SET']), amount: int.min(0), reason: z.string().trim().min(1).max(120) }),
  z.object({ kind: z.literal('admin.removePlayer'), memberId: id }),
  z.object({ kind: z.literal('admin.transferOwnership'), memberId: id }),
  z.object({ kind: z.literal('admin.closeRoom') }),
]);
export type ClientCommand = z.infer<typeof commandSchema>;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), protocolVersion: z.number(), roomId: id }),
  z.object({ type: z.literal('command'), commandId: id, command: commandSchema }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/* ───────────── server → client ───────────── */

export interface ErrorInfo {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryAfterMs?: number;
}

export type ServerMessage =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'result'; commandId: string; status: 'committed' | 'rejected'; error?: ErrorInfo; version: number }
  | { type: 'fatal'; code: 'PROTOCOL_UNSUPPORTED' | 'ROOM_NOT_FOUND' | 'FORBIDDEN'; message: string }
  | { type: 'pong'; serverTime: number };

export type Role = 'owner' | 'player' | 'observer' | 'pending' | 'viewer';

export interface SeatView {
  index: number;
  empty: boolean;
  memberId?: string;
  nickname?: string;
  stack?: number;
  participation?: 'ACTIVE' | 'SITTING_OUT';
  returnOnBB?: boolean;
  leaving?: boolean;
  connected?: boolean;
  /** dealt into the current hand */
  inHand?: boolean;
  waitingForNextHand?: boolean;
  folded?: boolean;
  allIn?: boolean;
  street?: number;
  lastAction?: string | null;
  /** how many hole cards this seat holds (for card backs). Opponents' values are never sent. */
  holeCount?: number;
  /** viewer's own cards, or opponents' cards that were publicly shown. null = hidden */
  cards?: Array<string | null>;
  handName?: string | null;
  isDealer?: boolean;
  isSB?: boolean;
  isBB?: boolean;
  timeBankMs?: number;
}

export interface LegalView {
  turnId: number;
  canCheck: boolean;
  callAmount: number;
  callIsAllIn: boolean;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  allInAmount: number;
  isBet: boolean;
}

export interface PotView {
  amount: number;
  eligibleSeats: number[];
}

export interface HandView {
  id: string;
  no: number;
  phase: 'BETTING' | 'RUNOUT_VOTE' | 'RUNOUT' | 'COMPLETE';
  street: 'preflop' | 'flop' | 'turn' | 'river';
  boards: string[][];
  /** chips in the middle (excluding current street bets shown beside seats) */
  collectedPot: number;
  totalPot: number;
  pots: PotView[];
  currentBet: number;
  toActSeat: number | null;
  turnId: number;
  /** absolute server time (ms) the current decision expires, or null for unlimited */
  deadline: number | null;
  bankActive: boolean;
  dealerSeat: number;
  sbSeat: number;
  bbSeat: number;
  runs: 1 | 2;
  vote: null | { deadline: number; pendingSeats: number[]; mine: 'yes' | 'no' | 'pending' | 'n/a' };
  results: HandResults | null;
  rules: Pick<Config, 'sb' | 'bb' | 'ante'>;
}

export interface FairnessView {
  commit: string;
  handNo: number;
  /** deck positions of the dealing procedure, so the browser can check proofs sit where they should */
  playersInDealOrder: number[]; // seats, starting left of the dealer
  proofs: CardProof[]; // public cards (board, shown hands, burns once the hand is over)
  mine: CardProof[]; // viewer's own hole cards
  rabbit: CardProof[]; // only if this viewer used rabbit hunting
  complete: boolean;
}

export interface LedgerEntryView {
  id: number;
  ts: number;
  memberId: string;
  type: 'BUY_IN' | 'TOP_UP' | 'CASH_OUT' | 'HOST_ADJUSTMENT';
  amount: number;
  reason?: string;
  handNo?: number;
}

export interface LedgerRow {
  memberId: string;
  nickname: string;
  buyIn: number;
  buyOut: number;
  stack: number;
  committed: number;
  net: number;
}

export interface LogEntryView {
  seq: number;
  ts: number;
  kind: 'system' | 'hand' | 'config' | 'admin' | 'chat';
  handNo?: number;
  text: string;
  memberId?: string;
}

export interface RequestView {
  id: string;
  kind: 'seat' | 'topup';
  memberId: string;
  nickname: string;
  seat?: number;
  amount: number;
  sitOut?: boolean;
  createdAt: number;
}

export interface PendingView {
  id: string;
  kind: 'adjust' | 'topup' | 'config' | 'stop';
  memberId?: string;
  text: string;
}

export interface Snapshot {
  protocolVersion: number;
  roomId: string;
  version: number;
  serverTime: number;
  viewer: { memberId: string; role: Role; nickname: string | null; ritPref: 'yes' | 'no' | 'ask'; autoBank: boolean; seat: number | null; myRequest: RequestView | null };
  room: {
    status: 'OPEN' | 'CLOSED';
    ownerId: string;
    ownerNickname: string;
    gameStatus: 'STOPPED' | 'RUNNING';
    paused: boolean;
    stopAfterHand: boolean;
    nextHandAt: number | null;
    config: Config;
    configVersion: number;
    pendingConfig: Partial<Config> | null;
    handCount: number;
    createdAt: number;
  };
  seats: SeatView[];
  hand: HandView | null;
  legal: LegalView | null;
  fairness: FairnessView | null;
  rabbit: { cards: string[] } | null;
  rabbitAvailable: boolean;
  canShow: { cards: Array<0 | 1> } | null;
  requests: RequestView[]; // owner only
  pending: PendingView[];
  members: Array<{ id: string; nickname: string; role: Role; seat: number | null; connected: boolean; short: string }>;
  ledger: { rows: LedgerRow[]; entries: LedgerEntryView[]; committedLive: boolean };
  log: LogEntryView[];
}

/** Shown in the UI as "not available yet" so no toggle ever looks functional when it isn't. */
export const UNAVAILABLE_SETTINGS: Array<{ key: string; label: string; why: string }> = [
  { key: 'variants', label: 'Omaha variants (PLO4/PLO5, Hi/Lo)', why: 'Planned for a later release.' },
  { key: 'straddle', label: 'UTG live straddle', why: 'Planned for a later release.' },
  { key: 'blindLevels', label: 'Blind levels / tournament clock', why: 'Planned for a later release.' },
  { key: 'bombPots', label: 'Bomb pots', why: 'Planned for a later release.' },
  { key: 'doubleBoard', label: 'Double board', why: 'Planned for a later release.' },
  { key: 'sevenDeuce', label: '7-2 bounty', why: 'Planned for a later release.' },
  { key: 'nit', label: 'Nit side game', why: 'Planned for a later release.' },
  { key: 'cents', label: 'Cents precision', why: 'Whole chips only for now.' },
  { key: 'spectators', label: 'Face-up spectators', why: 'Planned for a later release.' },
  { key: 'dealAway', label: 'Deal to away players', why: 'Planned for a later release.' },
  { key: 'autoTrim', label: 'Auto-trim excess raises', why: 'Planned for a later release.' },
  { key: 'rebuyFlow', label: 'Busted-player rebuy approval flow', why: 'Use “Add chips” requests, which the host approves.' },
];
