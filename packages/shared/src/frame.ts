import type { CardCode, CardSlot } from "./cards.js";
import type { PublicConfig } from "./config.js";

export type GameId = string;
export type PlayerId = string;
export type HandId = string;
export type SeatNo = number; // 1..10

export type TableStatus = "waiting" | "inProgress";

/** Per-player membership status at the table (SPEC 8, 05 s3.2). */
export type PlayerStatus =
  | "watching"
  | "requestedGameIngress"
  | "waitingNextGameToEnter"
  | "inGame"
  | "standingUp"
  | "quiting";

/** Per-player status inside the running hand (05 pGS). */
export type HandPlayerStatus = "inGame" | "fold" | "allIn";

/**
 * Next-step codes (sNA). The client reads them only to pick banners/buttons; the timing lives in turn.nextStepAt.
 * FCPFS wait for actor; NSAA next after action; NSAF next after fold; NSAAD all-in reveal; NSARD run-it-twice votes;
 * NSAGRS result display (showdown); NSAGR result display (no showdown); FOAR rebuy owner approval; null idle.
 */
export type NextStep = "FCPFS" | "NSAA" | "NSAF" | "NSAAD" | "NSARD" | "NSAGRS" | "NSAGR" | "FOAR" | "NSARB" | null;

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  status: PlayerStatus;
  stack: number;
  winCount: number;
  quitCount: number;
  /** requested seat while status === requestedGameIngress */
  intendedSeat?: SeatNo;
  /** stack the guest asked for while requesting */
  requestedStack?: number;
  /** set when the player pressed Away (SUNH) or is away */
  away?: boolean;
  /** leave seat next hand queued (QNH) */
  quitNextHand?: boolean;
  /** epoch ms the socket dropped; absent while connected */
  disconnectedSince?: number;
  /** owner allowed this unseated player to see hole cards (spectator mode) */
  spectator?: boolean;
  /** seated player ticked "Allow unseated players to see my hole cards" (SPEC 2.3; ARCH 5.4 item 4). Additive (W1 2026-10-26). */
  allowSpectator?: boolean;
  rebuyCount?: number;
  /** bust: owes rebuy decision */
  emoji?: string | null;
}

export type BetValue = number | "check";

export interface HandPlayerCards {
  /** [] after fold unless showing; length = hole cards dealt */
  cards: CardSlot[];
  /** hand description run 1/2, server strings e.g. "pair (6)" */
  name1?: string | null;
  name2?: string | null;
  /** rabbit-hunt variants, only for requesters */
  name1RH?: string | null;
  name2RH?: string | null;
  /** equity percent (float) while all-in run-out, null otherwise */
  prob1?: number | null;
}

export interface StreetPos {
  /** 1|2 run */
  run: 1 | 2;
  /** 0 preflop,1 flop,2 turn,3 river,4 showdown,5 result */
  stage: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface PlayerResult {
  /** cards used in winning hand per run (hole cards + board codes) */
  runs: Partial<Record<"1" | "2", { hc: CardCode[]; position: number; winning?: boolean }>>;
  gained: number;
}

export interface HandView {
  handNumber: number;
  handId: HandId;
  /** commitment hex published before any card is dealt (SPEC 20) */
  commitment: string;
  dealerSeat: SeatNo | null;
  deadButton: boolean;
  dealerId: PlayerId | null;
  smallBlindId: PlayerId | null;
  bigBlindId: PlayerId | null;
  straddleId: PlayerId | null;
  inHandIds: PlayerId[];
  playerStatus: Record<PlayerId, HandPlayerStatus>;
  street: StreetPos | null;
  /** number of runs, [2] when run it twice agreed */
  runs: number;
  board: { "1": CardCode[]; "2"?: CardCode[] };
  /** pot collected from previous streets */
  pot: number;
  bets: Record<PlayerId, BetValue>;
  highestBet: number;
  minRaise: number;
  /** max amount the actor may bet (effective stack cap) */
  maxBet: number | null;
  /** players who have the BB option (may check) */
  optionIds: PlayerId[];
  /** players that already acted this street / may not re-raise (cRPI) */
  noReraiseIds: PlayerId[];
  bigBlindChecked: boolean;
  /** all remaining players are all-in: run-out mode */
  directToNext: boolean;
  /** winning highlight cards on the board (tHC) */
  winningBoardCards: CardCode[] | null;
}

export interface TurnView {
  playerId: PlayerId | null;
  /** "player taking turn": equals playerId, null during the 800 ms gap */
  taking: PlayerId | null;
  actionStartedAt: number | null;
  deadlineNoBank: number | null;
  deadlineWithBank: number | null;
  nextStep: NextStep;
  nextStepAt: number | null;
  bankMs: Record<PlayerId, number>;
  ritWaiting: boolean;
  ritVotes: Record<PlayerId, boolean>;
  rebuyPromptIds: PlayerId[];
  /** Rebuy flow detail (SPEC 8.6; U-R1 durations are placeholders). Additive. phase "decision" = busted players decide; "approval" = owner decides (nextStep FOAR). */
  rebuy?: { phase: "decision" | "approval"; deadlineAt: number | null; requests: Record<PlayerId, number | null> };
  /** Absolute deadline of the disconnected-actor bar (SPEC 7.3, length U-T6 placeholder). Additive. */
  offlineLimitAt?: number | null;
}

export interface RabbitView {
  enabled: boolean;
  hunters: PlayerId[];
  /** only present in frames sent to requesters */
  cards: { "1": CardCode[] } | null;
}

/** The viewer-specific part of a snapshot. */
export interface YouView {
  id: PlayerId;
  name: string;
  mutedIds: PlayerId[];
  straddling: boolean;
  isOwner: boolean;
}

/** One frame. `registered` carries a complete Frame; deltas carry Partial deep (arrays replaced, "<D>" deletes). */
export interface Frame {
  meta: { id: GameId; now: number; pre: number; sN: number; version: string; mEV: number };
  table: {
    status: TableStatus;
    ownerId: PlayerId;
    /** epoch ms the game was paused at, null if not paused */
    pausedAt: number | null;
    /** stop after this hand queued */
    stopQueued: boolean;
    handNumber: number;
    /** config changes waiting for the next hand */
    configQueued: boolean;
    config: PublicConfig;
    /** blind clock: next level time, null when n/a */
    nextBlindAt: number | null;
    nextBlind: { sb: number; bb: number; ante: number | null } | null;
    spectatorMode: boolean;
    /** god-mode allowed ids (gDM) */
    godModeIds: PlayerId[];
    /** auto-deal-off waiting banner etc. */
    waitingMessage: string | null;
    /** CURRENT blind level in force (SPEC 4.2 info `10 / 20`, `(A: n)`); `level` is 1-based into config.blindLevels. Additive; absent => derive from config.blindLevels[0]. */
    blinds: { sb: number; bb: number; ante: number | null; level: number };
    /** connected viewers with no seat (SPEC 4.1 spectator count). Additive. */
    spectatorCount: number;
  };
  seats: Array<[SeatNo, PlayerId]>;
  players: Record<PlayerId, PlayerInfo>;
  hand: HandView | null;
  turn: TurnView;
  /** hole cards per player in the hand, per-recipient projection */
  cards: Record<PlayerId, HandPlayerCards>;
  result: Record<PlayerId, PlayerResult> | null;
  rabbit: RabbitView;
  /** viewer only; absent in deltas unless changed */
  you?: YouView;
}

export const DELETE = "<D>" as const;
export type DeepDelta<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepDelta<T[K]> | typeof DELETE }
    : T;
export type FrameDelta = DeepDelta<Frame>;
