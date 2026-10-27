import type { CardCode } from "./cards.js";
import type { GameConfig } from "./config.js";
import type { GameId, PlayerId, SeatNo } from "./frame.js";

/** Field errors: HTTP 422 with a JSON object field -> message (SPEC 2.3). */
export type FieldErrors = Record<string, string>;

export interface NewGameRequest {
  playerName: string;
  gM: "th";
  /** owner-chosen starting stack, 1..STACK_MAX (DEVIATION from the reference, which always sends 1000; owner decision 2026-10-27) */
  playerStack: number;
  bigBlind: 20;
  smallBlind: 10;
  cM: false;
}
export interface NewGameResponse {
  gameID: GameId;
  playerID: PlayerId;
  isNetworkPlayer: false;
  playerUsername: string;
}

export interface CurrentPlayerInfos {
  id: PlayerId;
  networkUsername: null;
  isNetworkPlayer: false;
}

export interface RequestIngressBody {
  seat: SeatNo;
  playerName: string;
  allowSpectator: boolean;
  stack: number | null;
  sitAsAway?: boolean;
}

/** POST /games/:id/approve_player */
export interface ApprovePlayerBody { playerID: PlayerId; stack?: number }
/** POST /games/:id/reject_player, remove_player, transfer_ownership, put_in_away_mode */
export interface PlayerIdBody { playerID: PlayerId }
/** POST /games/:id/update_player */
export interface UpdatePlayerBody { playerID: PlayerId; stackChange: number; stackChangeMode: "ADD" | "REMOVE" | "SET" }
/** POST /games/:id/toggle_god_mode */
export interface ToggleGodModeBody { playerID: PlayerId; allow: boolean }
/** POST /games/:id/update_game body is a GameConfig; 200 -> {queued:boolean} */
export type UpdateGameBody = GameConfig;
export interface UpdateGameResponse { queued: boolean }
/** POST /games/:id/request_rebuy */
export interface RequestRebuyBody { value: number }

/** GET /api/games/:id/log_v3?hand_number=N[&after_at=] : array of entries; createdAt = epoch ms * 100 */
export interface LogEntry { createdAt: number; msg: string }

export interface LedgerMovement { kind: "tookSeat" | "quit" | "addStack" | "removed" | "resetStack"; value: number }
export interface LedgerSession {
  id: string;
  status: "playing" | "finished" | "notStarted";
  buy_in: number;
  buy_out: number;
  start_hand_number: number | null;
  finish_hand_number: number | null;
  movements: LedgerMovement[];
}
export interface LedgerPlayerInfo {
  id: PlayerId;
  name: string;
  buyInSum: number;
  buyOutSum: number;
  inGame: number;
  nitEscrow: number;
  net: number;
}
export interface LedgerResponse {
  playersInfos: Record<PlayerId, LedgerPlayerInfo>;
  buyInTotal: number;
  buyOutTotal: number;
  inGameTotal: number;
  nitEscrowTotal: number;
  gameHasRake: false;
  rakedValue: 0;
  rakedValueWaitingToBeCollected: 0;
}

/** GET /healthz */
export interface Health { ok: true; version: string; uptimeSec: number; tables: number }

/** Fairness endpoints (SPEC 20) */
export interface FairnessUsage {
  kind: "hole" | "burn" | "board";
  run: 1 | 2;
  street: 0 | 1 | 2 | 3;
  playerId?: PlayerId;
  /** true for rabbit-hunt cards (exposed only to requesters); additive */
  rabbit?: boolean;
  indices: number[];
}
/** One card exposed to at least one viewer during the hand, with its Merkle proof (docs/FAIRNESS-MERKLE.md 8). */
export interface RevealedCard {
  index: number; // deck position 0..51
  card: CardCode;
  salt: string; // per-card salt, 64 hex
  proof: string[]; // 6 sibling hashes, bottom-up
}
/** Published when the result window closes. Contains ONLY exposed cards; mucked/burn/undealt values and salts never appear. */
export interface FairnessReveal {
  gameId: GameId;
  handNumber: number;
  handId: string;
  commitment: string;
  /** previous hand's commitment; 64 zeros for the first hand of the table */
  prevCommitment: string;
  root: string;
  dealOrder: PlayerId[];
  /** deck positions consumed per player/street (indices only, no values) */
  usage: FairnessUsage[];
  cards: RevealedCard[];
  revealedAtMs: number;
}
export interface FairnessRecord {
  commitment: string;
  prevCommitment: string;
  root: string;
  committedAtMs: number;
  reveal: FairnessReveal | null;
}

/* ---------- additive HTTP shapes (W1 review 2026-10-26; ARCH 5.1 table) ---------- */
/** Any 401/403/429 JSON body. */
export interface ApiErrorBody { code: string }
/** 422 body of POST start-game (SPEC 2.5; text U-J2). */
export interface StartGameError { value: string }
/** 422 body of request_rebuy / resolve_rebuy. */
export interface RebuyError { message: string }
/** POST /games/:id/resolve_rebuy */
export interface ResolveRebuyBody { playerID: PlayerId; approve: boolean; stack?: number }
/** POST update_player / remove_player response */
export interface QueuedResponse { queued: boolean }
/** GET /games/:id/current_or_next_configs (queued config if one is pending, else current) */
export type CurrentOrNextConfigs = GameConfig & { queued: boolean };
/** GET /games/:id/players/:pid (owner edit screen, SPEC 9.4) */
export interface PlayerEditResponse {
  player: { id: PlayerId; name: string; status: import("./frame.js").PlayerStatus; stack: number; intendedSeat?: SeatNo; requestedStack?: number; away?: boolean; spectator?: boolean };
  enqueuedChanges: Array<{ kind: "update" | "remove" | "approve"; mode?: "ADD" | "REMOVE" | "SET"; value?: number }>;
}
