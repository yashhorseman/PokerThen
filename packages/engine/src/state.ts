/** Internal TableState shape (JSON-serialisable) and shared helpers. Never serialised to clients. */
import type { CardCode, EngineEffect, Entropy, FairnessUsage, GameConfig, LedgerMovement, NextStep, PlayerStatus, TableState } from "@pokerthen/shared";

export interface Session {
  id: string; buy_in: number; buy_out: number;
  start_hand_number: number | null; finish_hand_number: number | null;
  movements: LedgerMovement[];
  finished: boolean;
}

export type QueuedChange = { kind: "update"; mode: "ADD" | "REMOVE" | "SET"; value: number };

export interface PlayerRec {
  id: string; name: string; status: PlayerStatus; stack: number;
  winCount: number; quitCount: number; seat: number | null;
  intendedSeat?: number; requestedStack?: number; sitAsAway?: boolean;
  allowSpectator: boolean;
  away: boolean; quitNextHand: boolean; removeQueued: boolean;
  disconnectedSince: number | null;
  rebuyCount: number; emoji: string | null; straddling: boolean; muted: string[];
  bankMs: number; missedSB: boolean; entered: boolean;
  queued: QueuedChange[];
  sessions: Session[];
}

export type Phase =
  | "betting" | "gap" | "ritVote" | "runout" | "result" | "idle";

export interface UsageRec { kind: "hole" | "burn" | "board"; run: 1 | 2; street: 0 | 1 | 2 | 3; playerId?: string; rabbit?: boolean; indices: number[] }

export interface PlayerResultRec { gained: number; runs: Record<string, { hc: CardCode[]; position: number; winning: boolean }> }

export interface HandRec {
  id: string; number: number; commitment: string; root: string; prevCommitment: string;
  deck: CardCode[]; masterSalt: string; cursor: number;
  usage: UsageRec[]; dealOrder: string[];
  holes: Record<string, [CardCode, CardCode]>; holeIdx: Record<string, [number, number]>;
  showing: Record<string, [boolean, boolean]>;
  exposed: number[];
  dealerSeat: number | null; dealerId: string | null; deadButton: boolean;
  sbId: string | null; bbId: string | null; straddleId: string | null;
  sbAmt: number; bbAmt: number;
  participants: string[];
  status: Record<string, "inGame" | "fold" | "allIn">;
  startStacks: Record<string, number>;
  contrib: Record<string, number>; bets: Record<string, number>; checked: Record<string, boolean>;
  pot: number;
  stage: 0 | 1 | 2 | 3 | 4 | 5; run: 1 | 2; runs: 1 | 2;
  board1: CardCode[]; board2: CardCode[];
  /** stage at the moment the run-out started (first street of run 2 = this + 1) */
  runoutFrom: number;
  highest: number; lastRaise: number; toAct: string[]; noReraise: string[]; bbChecked: boolean;
  phase: Phase; closed: boolean;
  gapKind: "advance" | null;
  actor: string | null; actionStartedAt: number | null; deadlineNoBank: number | null; deadlineWithBank: number | null; bankActive: boolean;
  nextStep: NextStep; nextStepAt: number | null;
  directToNext: boolean;
  ritWaiting: boolean; ritVotes: Record<string, boolean>;
  /** run-out pointer */
  rn: { run: 1 | 2; stage: number } | null;
  equity: Record<string, number> | null;
  result: Record<string, PlayerResultRec> | null; winningBoard: CardCode[] | null;
  showdown: boolean;
  rabbit: { enabled: boolean; hunters: string[]; cards: CardCode[]; idx: number[]; boardBefore: CardCode[] };
  revealedOnce: boolean;
}

export interface RebuyRec { phase: "decision" | "approval"; deadlineAt: number; ids: string[]; requests: Record<string, number | null>; resolved: string[] }

export interface S {
  v: 1; gameId: string; ownerId: string; createdAt: number;
  status: "waiting" | "inProgress";
  handNumber: number;
  players: Record<string, PlayerRec>; order: string[];
  config: GameConfig; queuedConfig: GameConfig | null;
  stopQueued: boolean; pausedAt: number | null; godModeIds: string[];
  buttonSeat: number | null;
  prevCommitment: string;
  blindLevel: number; blindClockAt: number | null; lastAnte: number;
  hand: HandRec | null;
  rebuy: RebuyRec | null;
  ritReveal: boolean;
  sessionSeq: number;
}

export interface Env { now: number; entropy: Entropy; fx: EngineEffect[] }

export const asS = (t: TableState): S => t as unknown as S;
export const asT = (s: S): TableState => s as unknown as TableState;

export function raw(s: S, id: string): string {
  return `"${s.players[id]?.name ?? "Guest"} @ ${id}"`;
}

/** hand number a non-hand log line belongs to */
export function logNo(s: S): number {
  return s.hand && !s.hand.closed ? s.hand.number : s.handNumber + 1;
}

export function log(env: Env, s: S, msg: string, onlyFor?: string, handNo?: number): void {
  const e: EngineEffect = { kind: "log", handNumber: handNo ?? logNo(s), msg, atMs: env.now };
  if (onlyFor) (e as { onlyFor?: string }).onlyFor = onlyFor;
  env.fx.push(e);
}

export function seatedIds(s: S): string[] {
  return Object.values(s.players).filter((p) => p.seat !== null).sort((a, b) => a.seat! - b.seat!).map((p) => p.id);
}

export function handRunning(s: S): boolean {
  return !!s.hand && !s.hand.closed;
}

export function allUsage(h: HandRec): FairnessUsage[] {
  return h.usage.map((u) => ({ ...u, indices: [...u.indices] })) as FairnessUsage[];
}
