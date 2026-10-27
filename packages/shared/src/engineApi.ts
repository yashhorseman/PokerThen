/**
 * FROZEN CONTRACT between W2 (engine) and W3 (server). Owned by W1; changes need the architect.
 * The engine is a deterministic, synchronous, I/O-free state machine over a JSON-serialisable TableState.
 * The server (a) serialises commands per table, (b) calls the engine, (c) persists the new state + effects
 * SYNCHRONOUSLY, (d) only then broadcasts frames and answers the HTTP request.
 */
import type { CardCode } from "./cards.js";
import type { GameConfig } from "./config.js";
import type { Frame, GameId, PlayerId } from "./frame.js";
import type { ActionMsg } from "./protocol.js";
import type { FairnessReveal, FieldErrors, LedgerResponse, LedgerSession, RequestIngressBody } from "./http.js";

/** Opaque to the server: JSON-serialisable, contains the secret deck/salt of the running hand. NEVER send it to clients. */
export type TableState = { readonly __brand: "TableState" } & Record<string, unknown>;

/** Cryptographic entropy source; production = crypto.randomBytes. Tests inject a deterministic one. */
export type Entropy = (bytes: number) => Uint8Array;

export interface EngineCtx {
  /** epoch ms, supplied by the server (never read Date.now() inside the engine) */
  now: number;
  entropy: Entropy;
}

export type EngineCommand =
  | { kind: "requestIngress"; body: RequestIngressBody }
  | { kind: "approvePlayer"; playerID: PlayerId; stack?: number }
  | { kind: "rejectPlayer"; playerID: PlayerId }
  | { kind: "updatePlayer"; playerID: PlayerId; stackChange: number; stackChangeMode: "ADD" | "REMOVE" | "SET" }
  | { kind: "removePlayer"; playerID: PlayerId }
  | { kind: "transferOwnership"; playerID: PlayerId }
  | { kind: "putInAway"; playerID: PlayerId }
  | { kind: "toggleGodMode"; playerID: PlayerId; allow: boolean }
  | { kind: "updateGame"; config: GameConfig }
  | { kind: "startGame" }
  | { kind: "requestRebuy"; value: number }
  | { kind: "resolveRebuy"; playerID: PlayerId; approve: boolean; stack?: number }
  | { kind: "action"; action: ActionMsg }
  /** socket presence; actor = player whose socket count changed */
  | { kind: "presence"; connected: boolean }
  /** server restarted: shift every pending deadline forward by the downtime so nobody is timed out by an outage; actor = "system" */
  | { kind: "resume"; downtimeMs: number };

export type EngineEffect =
  /** one log line; onlyFor = visible only to that player (e.g. "Your hand is ..."). msg uses raw "Name @ id" form */
  | { kind: "log"; handNumber: number; msg: string; onlyFor?: PlayerId; atMs: number }
  /** commitment published BEFORE any card of the hand is exposed */
  | { kind: "commit"; gameId: GameId; handNumber: number; handId: string; commitment: string; prevCommitment: string; root: string; committedAtMs: number }
  /** exposed cards + Merkle proofs published after the result window (FAIRNESS-MERKLE 8) */
  | { kind: "reveal"; reveal: FairnessReveal }
  /** one-off message to a single player or everyone */
  | { kind: "notice"; to: PlayerId | "all"; code: "ownershipTransferred" | "removed" | "approved" | "rejected"; message?: string }
  /** chat line authored by the system (BB toggle messages are client-local; this is for table notifications) */
  | { kind: "systemChat"; message: string };

export type CommandResult =
  | { ok: true; state: TableState; effects: EngineEffect[]; /** updateGame/updatePlayer/removePlayer: the change was queued for the next hand (additive, INTEGRATION) */ queued?: boolean }
  | { ok: false; status: 400 | 403 | 422; errors?: FieldErrors; value?: string; code?: string; /** rebuy 422 body {message} (additive) */ message?: string };

export interface EngineApi {
  createTable(p: { gameId: GameId; ownerId: PlayerId; ownerName: string; stack: number; sb: number; bb: number }, ctx: EngineCtx): { state: TableState; effects: EngineEffect[] };
  /** All mutations. `actor` is the cookie-derived player id. */
  command(state: TableState, actor: PlayerId, cmd: EngineCommand, ctx: EngineCtx): CommandResult;
  /** Run every timer that is due at ctx.now (deadlines, next-step, auto actions). Idempotent. */
  tick(state: TableState, ctx: EngineCtx): CommandResult;
  /** Earliest epoch ms at which tick() will change something; null when idle. */
  nextWakeAt(state: TableState): number | null;
  /** Per-recipient projection (hidden-card rules, SPEC 21). viewer=null for an unknown/anonymous socket. meta.pre is set by the server. */
  frame(state: TableState, viewer: PlayerId | null, now: number): Frame;
  /** Seated/known player names for chat; null if unknown */
  playerName(state: TableState, id: PlayerId): string | null;
  isOwner(state: TableState, id: PlayerId): boolean;
  mutedIds(state: TableState, id: PlayerId): PlayerId[];
  ledger(state: TableState): LedgerResponse;
  ledgerSessions(state: TableState, id: PlayerId): LedgerSession[];
  /** Additive, needed by HTTP routes (ARCH 5.1): queued config if pending else current + queued flag (GET current_or_next_configs). */
  currentOrNextConfig(state: TableState): GameConfig & { queued: boolean };
  /** Additive: data for the owner's edit-player screen (GET players/:pid); null when unknown. */
  playerEdit(state: TableState, id: PlayerId): import("./http.js").PlayerEditResponse | null;
  /** Current deck (for tests / the fairness verifier only; the server never exposes it before reveal). */
  _debugDeck?(state: TableState): CardCode[] | null;
}
