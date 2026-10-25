import type { Card } from './cards';

export const MAX_SEATS = 10;

export interface Config {
  sb: number;
  bb: number;
  ante: number;
  autoStartNext: boolean;
  showdownMs: 3000 | 6000 | 9000;
  /** null = unlimited decision time */
  actionSeconds: number | null;
  bankSeconds: number; // 0 disables the time bank
  bankRefillHands: number;
  revealWhenNoAction: boolean;
  rabbit: boolean;
  runTwice: 'off' | 'ask' | 'always';
  guestChat: boolean;
}

export const DEFAULT_CONFIG: Config = {
  sb: 10,
  bb: 20,
  ante: 0,
  autoStartNext: true,
  showdownMs: 6000,
  actionSeconds: 20,
  bankSeconds: 10,
  bankRefillHands: 10,
  revealWhenNoAction: true,
  rabbit: false,
  runTwice: 'off',
  guestChat: true,
};

export type Participation = 'ACTIVE' | 'SITTING_OUT';
export type RitPref = 'yes' | 'no' | 'ask';

export interface SeatState {
  memberId: string;
  stack: number;
  participation: Participation;
  leaving: boolean;
  returnOnBB: boolean;
  /** milliseconds */
  timeBank: number;
  handsSinceRefill: number;
  ritPref: RitPref;
  autoBank: boolean;
}

export interface HandPlayer {
  seat: number;
  memberId: string;
  startStack: number;
  stack: number;
  /** chips committed on the current street */
  street: number;
  /** chips committed this hand (antes + all streets) */
  total: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  /** the wager level this player last matched/raised to on this street; null if not yet acted */
  actedLevel: number | null;
  holes: [Card, Card];
  holeIdx: [number, number];
  shown: [boolean, boolean];
  vote: boolean | null;
  lastAction: string | null;
  handName: string | null;
}

export type HandPhase = 'BETTING' | 'RUNOUT_VOTE' | 'RUNOUT' | 'COMPLETE';

export interface PotResult {
  index: number;
  amount: number;
  eligible: number[]; // seats
  awards: Array<{ run: number; amount: number; winners: Array<{ seat: number; amount: number; hand: string | null }> }>;
}

export interface HandResults {
  refund: { seat: number; amount: number } | null;
  pots: PotResult[];
  /** seats whose hole cards were revealed at showdown */
  shownSeats: number[];
  uncontested: boolean;
}

export interface Hand {
  id: string;
  no: number;
  phase: HandPhase;
  rules: Config;
  dealerSeat: number;
  sbSeat: number;
  bbSeat: number;
  players: HandPlayer[];
  deck: Card[];
  salts: string[];
  /** Merkle root of the shuffled deck, published before dealing */
  commit: string;
  cursor: number;
  board: Card[];
  boardIdx: number[];
  board2: Card[] | null;
  board2Idx: number[];
  burnIdx: number[];
  currentBet: number;
  minRaise: number;
  fullBetMade: boolean;
  lastAggressor: number | null;
  /** last aggressor of the final betting round (decides show order at showdown) */
  lastAggressorForShow: number | null;
  /** seat of the last actor; the next to act is found clockwise from here */
  ptr: number;
  toAct: number | null;
  turnId: number;
  deadline: number | null;
  bankStartedAt: number | null;
  voteDeadline: number | null;
  stepAt: number | null;
  runs: 1 | 2;
  split: number;
  results: HandResults | null;
}

export interface TableState {
  config: Config;
  seats: Array<SeatState | null>;
  dealerSeat: number;
  handNo: number;
  hand: Hand | null;
  status: 'STOPPED' | 'RUNNING';
  paused: { at: number } | null;
  stopAfterHand: boolean;
  nextHandAt: number | null;
  /** after a hard stop the next game picks a random dealer */
  forcedDealerSeat: number | null;
}

export type ActionKind = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export type Command =
  | { type: 'SEAT'; seat: number; memberId: string; stack: number; sitOut: boolean }
  | { type: 'LEAVE'; seat: number }
  | { type: 'SIT_OUT'; seat: number; value: boolean; returnOnBB?: boolean }
  | { type: 'SET_PREFS'; seat: number; ritPref?: RitPref; autoBank?: boolean }
  | { type: 'ADD_CHIPS'; seat: number; amount: number }
  | { type: 'SET_STACK'; seat: number; stack: number }
  | { type: 'SET_CONFIG'; config: Config }
  | { type: 'START_GAME'; pick: number }
  | { type: 'NEXT_HAND' }
  | { type: 'SHUFFLE_SEATS'; order: number[] }
  | { type: 'STOP_AFTER_HAND'; value: boolean }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'START_HAND'; handId: string; deck: Card[]; salts: string[] }
  | { type: 'ACTION'; seat: number; turnId: number; action: ActionKind; raiseTo?: number }
  | { type: 'USE_BANK'; seat: number; turnId: number }
  | { type: 'TIMEOUT'; turnId: number }
  | { type: 'VOTE'; seat: number; yes: boolean }
  | { type: 'VOTE_TIMEOUT' }
  | { type: 'STEP' }
  | { type: 'SHOW'; seat: number; cards: number[] };

export interface EngineEvent {
  type: string;
  [k: string]: unknown;
}

export interface LegalActions {
  seat: number;
  turnId: number;
  canFold: true;
  canCheck: boolean;
  callAmount: number;
  callIsAllIn: boolean;
  canRaise: boolean;
  /** raise-to totals for this street */
  minRaiseTo: number;
  maxRaiseTo: number;
  allInAmount: number;
  isBet: boolean;
}

export class EngineError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
