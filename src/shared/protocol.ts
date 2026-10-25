/**
 * PokerThen wire protocol + shared types.  THIS FILE IS THE CONTRACT between
 * engine (src/engine), server (src/server) and client (src/client).
 *
 * Rules for changing it: additive only (new optional fields / new rpc methods).
 * Append a line to docs/PROTOCOL-CHANGES.md when you add something so the
 * integrator (main session) sees it.
 *
 * Design: the server is authoritative.  Every state change sends each connected
 * client a *per-recipient* full `Frame` (hidden cards are never included for
 * anybody else).  Commands are either fire-and-forget `ClientAction`s or
 * request/response `rpc` calls.  All times are server epoch milliseconds
 * (clients correct for clock offset with `Frame.serverNow`).
 *
 * Names/semantics deliberately mirror what the research reports observed on the
 * reference site (research/05-protocol-and-client-logic.md), but the wire format
 * is our own: no delta merging, no socket.io.
 */

// ───────────────────────────── primitives ─────────────────────────────

/** `rank + suit`, rank in 2-9,T,J,Q,K,A  suit in s,h,d,c   e.g. "As", "Td", "2c".  The UI prints T as 10. */
export type CardCode = string;
/** 10 URL-safe chars (A-Za-z0-9_-) */
export type PlayerId = string;
/** "pgl" + 21 URL-safe chars (24 total) */
export type GameId = string;

export type TableStatus = 'waiting' | 'inProgress';

/** Player lifecycle status (names taken from the reference client). */
export type PlayerStatus =
  | 'watching' //              spectator / guest, not seated
  | 'requestedGameIngress' //  seat requested, waiting for owner approval (intendedSeat/intendedStack set)
  | 'waitingNextGameToEnter' // approved/seated while a hand is running -> shown "IN NEXT HAND"
  | 'inGame' //                seated and playing (or waiting for first hand -> "WAITING")
  | 'standingUp' //            "Away": will sit out from the next hand (stands at hand end when dealToAway=false)
  | 'quitting'; //             leave-seat requested mid-hand: auto check/fold until hand end, then removed

/** 0 preflop, 1 flop, 2 turn, 3 river, 4 showdown(cards shown), 5 result (pot awarded). Mirrors reference `gT[1]`. */
export type Street = 0 | 1 | 2 | 3 | 4 | 5;

export type RunItTwiceMode = 'always' | 'ask_players' | 'no';
export type ShowdownTime = 'fast' | 'normal' | 'slow'; // 3s / 6s / 9s
export type BlindCountdownMode = 's' | 'c'; // 's' only start next blind countdown in the hand's beginning, 'c' never stop

// ───────────────────────────── configuration ─────────────────────────────

export interface BlindLevel {
  sb: number;
  bb: number;
  ante: number; // 0 when antes disabled
  /** minutes this level lasts; null = infinite (always null for the last level) */
  durationMin: number | null;
}

/** Owner-editable table settings ("Options > Game Configurations > GAME"). Labels: research/04 §3. */
export interface GameConfig {
  blindLevels: BlindLevel[]; //                         "Blind Levels" (>=1)
  antes: boolean; //                                    "Antes?"
  useCents: boolean; //                                 "Use cents values?"   locked: always false for PokerThen
  rabbitHunt: boolean; //                               "Allow players to see the undealt cards? (Rabbit Hunting)"
  runItTwice: RunItTwiceMode; //                        "Allow Run it Twice?"
  straddle: boolean; //                                 "Allow UTG Straddle 2BB?"
  autoStart: boolean; //                                "Auto start the next hand?"
  showdownTime: ShowdownTime; //                        "Showdown Presentation Time"
  dealToAway: boolean; //                               "Deal hands to away players?"
  decisionTimeSec: number | null; //                    "Decision Time Limit (seconds) (blank to no limit)"
  timeBankSec: number | null; //                        "Time Bank Length (seconds) (blank to no time bank)"
  timeBankRefillHands: number | null; //                "Number of played hands to fill time bank"
  revealAll: boolean; //                                "Reveal all hands when no more action is possible?"
  spectatorMode: boolean; //                            "Spectator Mode"
  allowRebuy: boolean; //                               "Allow Rebuy?"
  guestChat: boolean; //                                "Allow guests to send chat messages?"
  recordChat: boolean; //                               "Record table chat for Hand Replayer?"
  autoTrim: boolean; //                                 "Auto trim excess bets?"
  /** only meaningful with >1 blind level */
  countdownMode: BlindCountdownMode;
  restartLevel: number | null; // "Restart blind clock at the level" (1-based) or null
}

export const DEFAULT_CONFIG: GameConfig = {
  blindLevels: [{ sb: 10, bb: 20, ante: 0, durationMin: null }],
  antes: false,
  useCents: false,
  rabbitHunt: false,
  runItTwice: 'no',
  straddle: false,
  autoStart: true,
  showdownTime: 'normal',
  dealToAway: false,
  decisionTimeSec: 20,
  timeBankSec: 10,
  timeBankRefillHands: 10,
  revealAll: true,
  spectatorMode: false,
  allowRebuy: false,
  guestChat: true,
  recordChat: true,
  autoTrim: false,
  countdownMode: 's',
  restartLevel: null,
};

// ───────────────────────────── frame (server -> client state) ─────────────────────────────

export interface PlayerView {
  id: PlayerId;
  /** null = unnamed visitor ("Guest") */
  name: string | null;
  status: PlayerStatus;
  /** chips behind, NET of the current street's bet (what the plate shows) */
  stack: number;
  /** set while status === 'requestedGameIngress' */
  intendedSeat?: number;
  intendedStack?: number;
  /** badges: hands won / re-entries (the green and red pills on the plate) */
  winCount: number;
  quitCount: number;
  /** ms epoch when the socket dropped; undefined while connected */
  disconnectedSince?: number;
  /** away / will sit out ("sUNH") */
  away?: boolean;
  /** leaving at hand end ("qNH") */
  quitNextHand?: boolean;
  /** owner granted "see hole cards while unseated" (Spectator Mode) */
  godMode?: boolean;
  /** player asked to sit "with Away set" */
  sitAsAway?: boolean;
  /** hand gate: true when player holds chips and is dealt in next hand (informational) */
  inNextHand?: boolean;
}

export interface YouView {
  id: PlayerId;
  name: string | null;
  isOwner: boolean;
  mutedChatPlayerIds: PlayerId[];
  /** server-side auto-straddle preference ("Auto Straddle 2 Big Blinds when UTG?") */
  straddling: boolean;
}

export interface HandPlayerView {
  status: 'inGame' | 'fold' | 'allIn';
  /**
   * One entry per hole card (so clients can draw backs).  `value` is null unless the
   * recipient may see it; `showing` = revealed to everyone (shown at showdown / all-in / voluntary).
   * Folded players: empty array.
   */
  cards: Array<{ value: CardCode | null; showing: boolean }>;
  /** current hand label for run 1 / run 2, lowercase short form: "pair (6)", "two pair (A,7)", "straight", "high card" */
  names: [string | null, string | null];
  /** rabbit-hunt variant labels: rendered "(RH: PAIR (K))" */
  namesRH: [string | null, string | null];
  /** all-in equity in percent (float), only while `HandView.directToNextTurn`; client rounds */
  equity: number | null;
}

export interface ActorView {
  playerId: PlayerId;
  /** when the decision clock started */
  startedAt: number;
  /** deadline without time bank / with time bank (bank amount = withBank - withoutBank) */
  deadlineNoBank: number;
  deadlineWithBank: number;
  /** true once the time bank has been activated for this decision */
  bankActive: boolean;
}

export interface ResultEntry {
  gained: number; // chips won (>0) / lost? (0 for losers); client shows "+n" when >0
  /** per run: was this player a winner of that run, and which hole cards form part of the winning hand */
  run1?: { winner: boolean; cards: CardCode[] };
  run2?: { winner: boolean; cards: CardCode[] };
}

/** Why the engine is waiting; drives banners and countdown texts. */
export type StepCode =
  | 'actor' //            waiting for the player to act (FCPFS)
  | 'afterAction' //      800ms pause after an action (NSAA / NSAF)
  | 'ritVote' //          run-it-twice vote window (NSARD, 10s)
  | 'allInReveal' //      hands revealed + equity shown before the board runs (NSAAD, 4s)
  | 'runout' //           board is being dealt street by street, 4s apart
  | 'result' //           pot awarded; showdown presentation time running (NSAGRS)
  | 'resultNoShowdown' // pot awarded after folds (NSAGR, ~3s)
  | 'ownerNextHand' //    autoStart=false: waiting for owner "Next Hand »"
  | 'rebuyDecision' //    waiting for busted players to decide on rebuy
  | 'rebuyApproval' //    waiting for owner to approve/deny rebuys
  | 'paused'
  | null;

export interface HandView {
  number: number; // hand number (gN)
  id: string; //     12-char hand id
  dealerSeat: number | null;
  dealerId: PlayerId | null;
  /** true -> header says "(dead button)" and dealer marker is dimmed */
  deadButton: boolean;
  sbId: PlayerId | null;
  bbId: PlayerId | null;
  straddleId: PlayerId | null;
  street: Street;
  /** which run is currently being dealt (2 only during run-it-twice second run) */
  run: 1 | 2;
  /** number of runs this hand (1 or 2) */
  runs: 1 | 2;
  /** community cards by run, in deal order. For run-it-twice both rows contain the shared cards already dealt. */
  board: { 1: CardCode[]; 2: CardCode[] };
  /** board cards that form (part of) the winning hand(s) -> others are dimmed at result */
  highlightBoard: CardCode[];
  /** chips collected from previous streets (centre number) */
  pot: number;
  /** street bets by player: total put in this street; the literal 'check' after a check */
  bets: Record<PlayerId, number | 'check'>;
  /** current highest street bet (0 none) */
  highestBet: number;
  /** minimum legal raise-TO (total) */
  minRaiseTo: number;
  /** max raise-TO the recipient may make (effective-stack cap); only for recipient when they can act */
  maxRaiseTo: number | null;
  /** players holding the BB option (may check although facing the blind) */
  optionIds: PlayerId[];
  /** players who may NOT raise (action not reopened) */
  cannotRaiseIds: PlayerId[];
  /** BB checked its option this street (client plays two-taps) */
  bigBlindCheck: boolean;
  players: Record<PlayerId, HandPlayerView>;
  /** remaining time bank per player, ms */
  timeBank: Record<PlayerId, number>;
  actor: ActorView | null;
  /** everyone remaining is all-in (or only one has chips): board runs out, hands revealed, equity shown */
  directToNextTurn: boolean;
  step: StepCode;
  /** when the engine advances to the next step (sNAA); client uses it for countdowns / show-hand window (nextAt-600) */
  nextAt: number | null;
  /** run-it-twice vote in progress */
  rit: { until: number; votes: Record<PlayerId, boolean> } | null;
  rabbit: {
    /** the Reveal button is offered (hand ended before the river, rabbitHunt on) */
    available: boolean;
    /** players who pressed Reveal (everyone sees "Some players are seeing the undealt cards.") */
    hunters: PlayerId[];
    /** undealt board cards, ONLY for recipients who pressed Reveal, else null.  Index: cards to append to board[1] */
    cards: CardCode[] | null;
    until: number | null;
  };
  /** pot awards after the hand; null while playing */
  result: Record<PlayerId, ResultEntry> | null;
  /** recipient may press "Show All Cards" / per-card now (their cards are hidden and the hand is over) */
  canShow: boolean;
  /** straddle posted live this hand (dealer-button style "S" disc) */
  liveStraddle: boolean;
}

export interface RebuyView {
  /** busted players being asked, with decision deadline */
  prompting: PlayerId[];
  promptUntil: number | null;
  /** requests awaiting owner approval: playerId -> requested stack */
  pending: Record<PlayerId, number>;
  approvalUntil: number | null;
}

export interface Frame {
  seq: number;
  serverNow: number;
  gameId: GameId;
  ownerId: PlayerId;
  status: TableStatus;
  paused: boolean;
  /** owner queued "stop game on next hand" */
  stopQueued: boolean;
  /** hand ended, auto-deal off: owner sees "Next Hand »" */
  blinds: { sb: number; bb: number; ante: number };
  /** "Next Blind: sb/bb (A: x) in mm:ss"; null when no blind clock (single level) */
  blindClock: { nextAt: number | null; next: { sb: number; bb: number; ante: number } | null } | null;
  config: GameConfig;
  /** a config change is queued for the next hand */
  configQueued: boolean;
  you: YouView;
  players: Record<PlayerId, PlayerView>;
  /** occupied seats only: [seatNumber 1..10, playerId] */
  seats: Array<[number, PlayerId]>;
  /** owner only: number of pending seat requests (red badge on OPTIONS) */
  pendingRequests: number;
  /** owner-only pending request ids in arrival order (for the quick-accept queue) */
  pendingRequestIds: PlayerId[];
  hand: HandView | null;
  rebuy: RebuyView | null;
  /** spectator mode: ids allowed to see hole cards (owner/all see count) */
  spectatorIds: PlayerId[];
  /** ms epoch the table will auto deal the next hand / start (for "First deal in" style text); null otherwise */
  nextHandAt: number | null;
}

// ───────────────────────────── chat / log / ledger ─────────────────────────────

export interface ChatMessage {
  at: number;
  playerId: PlayerId | 'system';
  playerName: string;
  message: string;
  highlight?: boolean;
  autoMessage?: boolean;
}

/** Log lines are server-rendered text (names as `"Name @ id"`), see research/06 and research/04 §7.2 for the grammar. */
export interface LogEntry {
  /** ms epoch */
  at: number;
  hand: number;
  msg: string;
}

export interface LedgerPlayerRow {
  id: PlayerId;
  name: string;
  buyInSum: number;
  buyOutSum: number;
  inGame: number; //   current stack
  net: number;
}
export interface LedgerResponse {
  players: Record<PlayerId, LedgerPlayerRow>;
  buyInTotal: number;
  buyOutTotal: number;
  inGameTotal: number;
}
export interface LedgerSession {
  id: string;
  status: 'playing' | 'quit';
  buyIn: number;
  buyOut: number;
  startHand: number;
  finishHand: number | null;
  movements: Array<{ kind: 'tookSeat' | 'quit' | 'addStack' | 'removeStack' | 'resetStack'; value: number }>;
}

// ───────────────────────────── fairness (the one addition vs. the reference site) ─────────────────────────────

/**
 * Per hand the server commits to the full shuffled deck BEFORE dealing:
 *   commitment = SHA-256( salt || "|" || deck.join(" ") )   (hex)
 * The deck and salt are revealed once the hand (and rabbit-hunt window) is over.
 * Anybody can recompute the hash.  Deck order = [burn, hole cards in deal order..., ...] defined in src/engine/fairness.ts.
 */
export interface FairnessRecord {
  hand: number;
  handId: string;
  commitment: string;
  revealed: null | { salt: string; deck: CardCode[] };
}

// ───────────────────────────── client -> server ─────────────────────────────

/** Fire-and-forget game actions (reference name in comments).  Invalid actions are silently ignored. */
export type ClientAction =
  | { type: 'PLAYER_FOLD' }
  | { type: 'PLAYER_CHECK' }
  | { type: 'PLAYER_CALL' }
  /** value = total bet-to amount */
  | { type: 'PLAYER_RAISE'; value: number }
  | { type: 'ATB' } //                       activate time bank
  | { type: 'NH' } //                        owner: Next Hand »
  | { type: 'RS' } //                        owner: Shuffle Seats
  | { type: 'UP' } //                        owner: pause
  | { type: 'UR' } //                        owner: unpause
  | { type: 'TSG'; decision: boolean } //    owner: stop game after this hand / cancel
  | { type: 'SUNH' } //                      Away
  | { type: 'PLAYER_SIT_BACK'; waitBB?: boolean } // I'm Back
  | { type: 'QNH' } //                       leave seat (at hand end; check/fold until then)
  | { type: 'CQNH' } //                      cancel leave
  | { type: 'CANCEL_REQUEST_GAME_INGRESS' }
  | { type: 'DRITD'; decision: boolean } //  run-it-twice vote
  | { type: 'SHOW_HAND'; cardToShow: 'all' | CardCode }
  | { type: 'RUC' } //                       rabbit hunt: Reveal
  | { type: 'SSP'; straddling: boolean } //  auto-straddle preference
  | { type: 'RUP' }; //                      request a full frame

export interface RpcErrorBody {
  /** HTTP-like status, 422 = field validation */
  status: number;
  /** field -> message (422) */
  errors?: Record<string, string>;
  /** generic message / for startGame the 422 `value` text */
  message?: string;
}

/** request/response methods.  `params` -> `result`.  Failure = RpcErrorBody. */
export interface RpcMethods {
  requestIngress: { params: { seat: number; playerName: string; allowSpectator: boolean; stack: number | null; sitAsAway?: boolean }; result: 'OK' };
  /** owner only; stack optional = approve with edited stack */
  approvePlayer: { params: { playerId: PlayerId; stack?: number }; result: 'OK' };
  rejectPlayer: { params: { playerId: PlayerId }; result: 'OK' };
  /** owner only; mode default 'add'.  Applies next hand when a hand is running. */
  updatePlayer: { params: { playerId: PlayerId; stackChange: number; mode: 'add' | 'remove' | 'set' }; result: { enqueued: boolean } };
  removePlayer: { params: { playerId: PlayerId }; result: { enqueued: boolean } };
  transferOwnership: { params: { playerId: PlayerId }; result: 'OK' };
  toggleGodMode: { params: { playerId: PlayerId; allow: boolean }; result: 'OK' };
  putInAwayMode: { params: { playerId: PlayerId }; result: { enqueued: boolean } };
  startGame: { params: {}; result: 'OK' }; // 422 {message} on failure
  updateGame: { params: { config: GameConfig }; result: { enqueued: boolean } };
  getGameConfig: { params: {}; result: { current: GameConfig; queued: GameConfig | null } };
  getLog: { params: { hand: number; afterAt?: number }; result: LogEntry[] };
  getLedger: { params: {}; result: LedgerResponse };
  getPlayerSessions: { params: { playerId: PlayerId }; result: LedgerSession[] };
  requestRebuy: { params: { value: number }; result: 'OK' };
  resolveRebuy: { params: { playerId: PlayerId; approve: boolean; stack?: number }; result: 'OK' };
  sendChat: { params: { message: string }; result: 'OK' };
  toggleMute: { params: { playerId: PlayerId }; result: 'OK' };
  getFairness: { params: { hand: number }; result: FairnessRecord | null };
  setPlayerName: { params: { name: string }; result: 'OK' };
}
export type RpcMethodName = keyof RpcMethods;

export type ClientMessage =
  | { t: 'action'; action: ClientAction }
  | { t: 'rpc'; id: number; method: RpcMethodName; params: unknown }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'registered'; frame: Frame; chat: ChatMessage[]; serverNow: number }
  | { t: 'frame'; frame: Frame }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'rpcResult'; id: number; ok: true; data: unknown }
  | { t: 'rpcResult'; id: number; ok: false; error: RpcErrorBody }
  | { t: 'pong' }
  /** connection refused / terminated: code e.g. 'too-many-connections' | 'session-missing-token' | 'too-many-actions' | 'not-found' */
  | { t: 'failed'; code: string; msg?: string }
  /** table disposed */
  | { t: 'disposed' };

// ───────────────────────────── HTTP API ─────────────────────────────
//
// POST /new-game      body {playerName:string, playerStack:1000, smallBlind:10, bigBlind:20}   (PokerNow also posts gM:"th", cM:false, turnstileToken — we ignore those)
//                     -> 200 {gameID, playerID, playerUsername}   | 422 {playerName: "…"}  (field -> message)
//                     Server sets the httpOnly identity cookie `ptt` if the visitor has none.
// GET  /current-player-infos   -> {id, isNetworkPlayer:false, ...}
// GET  /games/:id              -> SPA shell (index.html);  unknown id -> 302 /
// WS   /ws?gameID=<id>&layout=d|m         (cookie auth, Origin checked)
// GET  /games/:id/ledger_:id.csv          -> text/csv
// GET  /games/:id/poker_now_log_:id.csv   -> text/csv  (name kept for URL fidelity)
// GET  /healthz                -> 200 "ok"

export const NICKNAME_ERROR = 'must be unique and length must be between 2 and 14';
export const NICKNAME_DUP_ERROR = 'must be unique on this game';
export const STACK_ERROR = 'must be a value between 1 and 1.000.000';
export const MAX_STACK = 1_000_000;
export const MAX_SEATS = 10;
