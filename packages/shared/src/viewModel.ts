/**
 * FROZEN client view-model contract (W4 produces, W5/W6/W7/W8 consume). Owned by W1; changes need the architect.
 * W4 derives these from (Frame, previous Frame, prefs, clock) with a pure function `deriveViewModel`.
 * Until W4 lands, UI workstreams build against fixtures in packages/shared/src/fixtures (W1).
 */
import type { CardCode } from "./cards.js";
import type { GameConfig } from "./config.js";
import type { ChatMessage } from "./protocol.js";
import type { NextStep, PlayerId, PlayerStatus, SeatNo } from "./frame.js";
import type { Prefs } from "./prefs.js";
import type { RequestIngressBody, FieldErrors } from "./http.js";

export type Orientation = "landscape" | "portrait";

/** A hole card as drawn. code=null renders a card back. */
export interface HoleCardVM {
  code: CardCode | null;
  /** value known to this viewer (own card or showing) */
  faceUp: boolean;
  /** raised (winning / shown at showdown): class `up` */
  up: boolean;
  /** dimmed (folded own cards, non-winning at showdown) */
  dim: boolean;
  /** face visible to you but not to others (class `sneak`) */
  sneak: boolean;
}

export interface BoardCardVM {
  code: CardCode;
  /** flipped (face up) yet; the flipper in W5 staggers 150 ms, VM gives the target */
  flipped: boolean;
  highlighted: boolean;
  /** `semi-hide`: not in the winning five / run 1 once run 2 started / rabbit card */
  semiHide: boolean;
  rabbit: boolean;
  afterPadding: boolean;
}

export interface HandChipVM {
  rows: Array<{ text: string; active?: boolean; run?: 1 | 2 }>;
  twoRuns: boolean;
  tone: "red" | "blue";
  /** "(RH: ...)" rabbit chip */
  rabbit: boolean;
}

export interface TimerVM {
  actionStartedAt: number;
  deadlineNoBank: number;
  deadlineWithBank: number;
  /** server-synced "now" accessor, ms; use for the 100 ms redraw */
  serverNow: () => number;
  paused: boolean;
  offline: boolean;
  /** bank pool left when the turn started (ms) */
  bankMs: number;
}

export type PlayerStatusLabel = "Fold" | "Waiting" | "Away" | "In Next Hand" | "Quitting" | null;

export interface PlayerVM {
  id: PlayerId;
  name: string;
  isYou: boolean;
  isOwner: boolean;
  stackText: string; // formatted per prefs/cents/BB; "All In" when applicable
  stackIsAllIn: boolean;
  statusLabel: PlayerStatusLabel;
  away: boolean;
  offline: boolean;
  quitting: boolean;
  folded: boolean;
  isDealer: boolean;
  isDecision: boolean; // class decision-current
  isWinner: boolean;
  gainedText: string | null; // "+50" / "-20"
  gainedNegative: boolean;
  bet: { text: string; check: boolean } | null;
  cards: HoleCardVM[]; // [] when none dealt / folded & not showing
  cardsFolded: boolean; // hide-cards fade
  handChip: HandChipVM | null;
  equity: { pct: number; leader: boolean; gray: boolean } | null;
  timer: TimerVM | null;
  winCount: number;
  quitCount: number;
  emoji: string | null;
  bubble: { text: string; until: number } | null;
  /** Additive optional fields (W1 review): status suffix text ` (Away)` / ` (Offline)` / `Offline & Away` pieces (SPEC 4.5, 19) */
  statusSuffix?: " (Away)" | " (Offline)" | null;
  /** per-seat menu (SPEC 4.5): viewer muted this player's chat */
  muted?: boolean;
  /** spectator allowed to see this player's cards (seated allowSpectator) */
  allowsSpectators?: boolean;
  /** frame.players[id].disconnectedSince passthrough for the OFFLINE chips */
  disconnectedSince?: number | null;
}

export interface SeatVM {
  /** slot 1..10 AFTER rotation (SPEC 4.4); CSS class table-player-<position> */
  position: number;
  seatNo: SeatNo;
  player: PlayerVM | null;
  /** empty slot the viewer may click "Sit" on */
  canSit: boolean;
  /** empty slot drawn as a dashed numbered box WITHOUT the Sit button: a seated viewer while the table is waiting (reference rule: empty seats show for viewers that are watching OR when the table status is waiting; the Sit button only for watching viewers) */
  viewOnly?: boolean;
  /** pending request of the viewer targets this seat */
  requestedByYou: boolean;
}

export interface BoardVM {
  run1: BoardCardVM[];
  run2: BoardCardVM[];
  /** missing slots drawn as semi-hidden backs with the REVEAL bar (rabbit hunting) */
  rabbitSlots: number;
  rabbitAvailable: boolean;
  rabbitMessage: boolean; // "Some players are seeing the undealt cards."
}

export interface DealerVM {
  /** slot positions (after rotation) of dealer disc and straddle disc */
  dealerPosition: number | null;
  dead: boolean;
  straddlePosition: number | null;
}

export interface PotVM {
  mainText: string;
  totalText: string | null; // "total 70" pill
}

export interface CenterMessageVM {
  kind: "none" | "waitOwnerDeal" | "paused" | "rebuyDecision" | "rebuyApproval" | "ritWait" | "rabbit" | "spectatorMode";
  text: string | null;
  seconds: number | null;
}

export interface InfoVM {
  ownerName: string | null;
  typeLabel: "NLH";
  blindsText: string; // "10 / 20"
  anteText: string | null; // "(A: 5)"
  nextBlindText: string | null;
}

export type ActionKind = "fold" | "check" | "call" | "raise" | "checkOrFold";

export interface ActionBarVM {
  visible: boolean;
  yourTurn: boolean;
  low: boolean; // off-turn: opacity .3 pre-action mode
  call: { label: string; enabled: boolean; highlighted: boolean; allIn: boolean; amount: number } | null;
  raise: { label: "Raise" | "Bet"; enabled: boolean; highlighted: boolean };
  check: { enabled: boolean; highlighted: boolean };
  fold: { enabled: boolean; highlighted: boolean; needsConfirmation: boolean };
  checkOrFold: { visible: boolean; highlighted: boolean };
  timeBank: { visible: boolean; activated: boolean; secondsLeft: number; /** server-time ms the decision limit ends (auto-activation fires then); null = unknown */ limitAt?: number | null };
  lockedUntil: number; // 750 ms button lock
  iAmBack: boolean;
  cancelIngress: boolean;
  /** `cards` = all of the viewer's hole cards (button order = hotkeys 1/2); `shown` = those already showing to everybody (rendered as filled `.active` segments, research/07 s1+3, B2 request) */
  showHand: { visible: boolean; until: number; cards: CardCode[]; shown?: CardCode[] } | null;
  rit: { visible: boolean; answered: boolean | null } | null;
}

export interface BetPanelVM {
  stack: number;
  highestBet: number;
  minRaise: number;
  maxAllowed: number;
  bigBlind: number;
  pot: number;
  initialValue: number;
  presets: { minRaise: number; half: number; threeQuarter: number; pot: number; allIn: number };
  /** values that are valid even outside [min,max] */
  preciseValues: number[];
  submitLabel: (value: number) => "Raise" | "Call" | "Bet";
  isValid: (value: number) => boolean;
  showAsBB: boolean;
}

export interface OwnerControlsVM {
  isOwner: boolean;
  canStart: boolean; // Start Game + Shuffle Seats
  canNextHand: boolean;
  canPause: boolean;
  paused: boolean;
  canStop: boolean;
  stopQueued: boolean;
  pendingRequests: number;
  quickAcceptQueue: Array<{ playerId: PlayerId; name: string; stack: number; seat: SeatNo }>;
}

export interface ConnectionVM {
  status: "connecting" | "connected" | "disconnected" | "failed" | "disposed";
  failedCode?: string;
  failedMsg?: string;
}

export interface TableViewModel {
  orientation: Orientation;
  connection: ConnectionVM;
  gameId: string;
  youId: PlayerId;
  youSeated: boolean;
  seats: SeatVM[]; // always 10 entries, ordered by position 1..10
  board: BoardVM;
  dealer: DealerVM;
  pot: PotVM;
  info: InfoVM;
  center: CenterMessageVM;
  action: ActionBarVM;
  owner: OwnerControlsVM;
  config: GameConfig;
  waitingBanner: boolean; // owner alone: "Waiting for others"
  tableStatus: "waiting" | "inProgress";
  nextStep: NextStep;
  spectatorCount: number;
  spectatorMode: boolean;
  fourColor: boolean;
  bbMode: boolean;
  handNumber: number;
  /** Additive optional (W4 should fill): viewer state needed for OPTIONS/LEAVE SEAT/AWAY/I'M BACK/cancel buttons (SPEC 2.4, 8). */
  you?: YouStateVM;
  /** config change waiting for next hand (banner `These settings are waiting the next hand to be defined.`) */
  configQueued?: boolean;
  /** rebuy popups (SPEC 8.6) */
  rebuy?: RebuyVM | null;
}

export interface YouStateVM {
  status: PlayerStatus | null;
  stack: number;
  away: boolean;
  quitQueued: boolean;
  pendingSeat: SeatNo | null;
  straddling: boolean;
  canLeaveSeat: boolean;
  canAway: boolean;
  /** owner granted me spectator (god mode) */
  isSpectator: boolean;
}
export interface RebuyVM {
  phase: "decision" | "approval";
  secondsLeft: number | null;
  /** viewer is busted and must decide */
  youDecide: boolean;
  /** owner: requests to approve */
  ownerRequests: Array<{ playerId: PlayerId; name: string; requestedStack: number | null }>;
}

/**
 * Additive data-fetch API (W4 provides via hook `useTableData()`; components outside core/ must not call fetch). Mirrors ARCH 5.1.
 */
export interface TableDataApi {
  /** GET log_v3 */
  loadLog(handNumber: number, afterAt?: number): Promise<import("./http.js").LogEntry[]>;
  loadLedger(): Promise<import("./http.js").LedgerResponse>;
  loadLedgerSessions(playerId: PlayerId): Promise<import("./http.js").LedgerSession[]>;
  loadConfigs(): Promise<import("./http.js").CurrentOrNextConfigs>;
  loadPlayerEdit(playerId: PlayerId): Promise<import("./http.js").PlayerEditResponse>;
  ledgerCsvUrl(): string;
  logCsvUrl(): string;
}

/** Commands the UI may issue (W4 implements; each returns when the request is sent / HTTP replied). */
export interface TableActions {
  fold(): void;
  check(): void;
  call(): void;
  raise(value: number): void;
  setIntendedAction(kind: ActionKind | null, value?: number): void;
  activateTimeBank(): void;
  nextHand(): void;
  shuffleSeats(): void;
  startGame(): Promise<void>;
  pause(): void;
  unpause(): void;
  stopGame(decision: boolean): void;
  away(): void;
  sitBack(): void;
  leaveSeat(cancel?: boolean): void;
  cancelIngress(): void;
  voteRunItTwice(decision: boolean): void;
  showHand(card: "all" | CardCode): void;
  revealRabbit(): void;
  setAutoStraddle(v: boolean): void;
  toggleMute(playerId: PlayerId): void;
  sendChat(text: string): Promise<void>;
  setEmoji(emoji: string | null): void;
  requestSeat(body: RequestIngressBody): Promise<{ ok: true } | { ok: false; errors: FieldErrors }>;
  approvePlayer(playerId: PlayerId, stack?: number): Promise<void>;
  rejectPlayer(playerId: PlayerId): Promise<void>;
  updatePlayer(playerId: PlayerId, mode: "ADD" | "REMOVE" | "SET", value: number): Promise<{ queued: boolean }>;
  removePlayer(playerId: PlayerId): Promise<{ queued: boolean }>;
  transferOwnership(playerId: PlayerId): Promise<void>;
  putInAway(playerId: PlayerId): Promise<void>;
  toggleGodMode(playerId: PlayerId, allow: boolean): Promise<void>;
  updateGame(config: GameConfig): Promise<{ queued: boolean }>;
  requestRebuy(value: number): Promise<void>;
  resolveRebuy(playerId: PlayerId, approve: boolean, stack?: number): Promise<void>;
  reconnect(): void;
}

/** Chat slice for W7. */
export interface ChatVM {
  messages: ChatMessage[];
  unread: number;
  mutedIds: PlayerId[];
  guestsAllowed: boolean;
  youCanChat: boolean;
  recording: boolean;
  names: Record<PlayerId, string>;
}

export interface PrefsApi {
  get(): Prefs;
  set(patch: Partial<Prefs>): void;
  subscribe(fn: (p: Prefs) => void): () => void;
}

/** Audio API (W8 implements in apps/web/src/audio, W4 wires the triggers listed in SPEC 18.1). */
export interface AudioApi {
  unlock(): void;
  play(name: import("./prefs.js").SoundName): void;
  setVolume(level: import("./prefs.js").VolumeLevel): void;
  setSecondaryDisabled(v: boolean): void;
  setChatBeepDisabled(v: boolean): void;
}

/** Player statuses that count as "seated" for rotation and UI. */
export const SEATED_STATUSES: readonly PlayerStatus[] = ["inGame", "standingUp", "waitingNextGameToEnter", "quiting"];
