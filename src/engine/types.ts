/**
 * ENGINE <-> SERVER CONTRACT (owner: main session; engine agent implements it in src/engine/index.ts).
 * The engine is the whole game domain: players, seats, requests, config, hands, timers/pacing, log, ledger,
 * chat, fairness.  It is pure TypeScript (no I/O, no timers): the server calls `tick(now)` whenever
 * `nextWakeAt()` is due, and sends `frameFor()` to every connection after any change.
 */
import type { ChatMessage, ClientAction, Frame, GameId, PlayerId, RpcErrorBody, RpcMethodName, RpcMethods, CardCode } from '../shared/protocol';

export class RpcError extends Error {
  constructor(public body: RpcErrorBody) { super(body.message ?? `rpc error ${body.status}`); }
  static validation(errors: Record<string, string>) { return new RpcError({ status: 422, errors }); }
  static forbidden(message = 'forbidden') { return new RpcError({ status: 403, message }); }
  static bad(message: string) { return new RpcError({ status: 400, message }); }
}

export interface EngineRandom {
  /** uniform integer in [0, maxExclusive) from a CSPRNG */
  randomInt(maxExclusive: number): number;
  /** n random bytes, hex encoded */
  randomHex(nBytes: number): string;
  /** 10-char url-safe / 21-char url-safe ids */
  randomId(len: number): string;
}

export interface CreateGameOptions {
  id: GameId;
  ownerId: PlayerId;
  ownerName: string;
  /** starting stack of the owner (the create form posts 1000) */
  ownerStack: number;
  smallBlind: number;
  bigBlind: number;
  now: number;
  rng?: EngineRandom;
  /** TESTS ONLY: supply the 52-card deck order for each hand instead of shuffling (still committed/hashed) */
  testDeck?: (handNumber: number) => CardCode[];
}

export interface GameEngine {
  readonly id: GameId;
  /** JSON string of the complete state INCLUDING secrets (decks, salts, hidden cards). Server persists it atomically. */
  serialize(): string;

  /** a visitor opened the table (registers them as 'watching' on first sight) */
  ensurePlayer(pid: PlayerId, now: number): void;
  setConnected(pid: PlayerId, connected: boolean, now: number): void;

  /** per-recipient snapshot; NEVER leaks other players' hidden cards (see HandPlayerView.cards) */
  frameFor(pid: PlayerId, now: number): Frame;
  chatHistory(pid: PlayerId): ChatMessage[];

  action(pid: PlayerId, action: ClientAction, now: number): void;
  /** throws RpcError (422 field errors / 403 / 400) */
  rpc<M extends RpcMethodName>(pid: PlayerId, method: M, params: RpcMethods[M]['params'], now: number): RpcMethods[M]['result'];

  /** advance time-driven state (timers, pacing, blind clock, auto deal) */
  tick(now: number): void;
  /** earliest ms epoch at which tick() has work to do, or null */
  nextWakeAt(): number | null;

  /** chat messages created since the last call (server pushes them to every socket) */
  drainChat(): ChatMessage[];
  /** true when state changed since the last call (server then re-sends frames); resets the flag */
  takeDirty(): boolean;

  logCsv(): string;
  ledgerCsv(): string;
}

export type CreateGame = (opts: CreateGameOptions) => GameEngine;
export type RestoreGame = (json: string, rng?: EngineRandom) => GameEngine;
