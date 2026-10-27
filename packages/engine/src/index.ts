import type { CardCode, EngineApi, LedgerResponse, LedgerSession, TableState } from "@pokerthen/shared";
import { command, createTable, nextWakeAt, tick } from "./commands.js";
import { buildFrame } from "./frame.js";
import { ledgerOf, sessionsOf } from "./table/ledger.js";
import { asS } from "./state.js";

export const engine: EngineApi = {
  createTable,
  command,
  tick,
  nextWakeAt,
  frame: (state, viewer, now) => buildFrame(asS(state), viewer, now),
  playerName: (state, id) => asS(state).players[id]?.name ?? null,
  isOwner: (state, id) => asS(state).ownerId === id,
  mutedIds: (state, id) => [...(asS(state).players[id]?.muted ?? [])],
  ledger: (state): LedgerResponse => ledgerOf(asS(state)),
  ledgerSessions: (state, id): LedgerSession[] => { const p = asS(state).players[id]; return p ? sessionsOf(p) : []; },
  currentOrNextConfig: (state) => { const s = asS(state); return { ...(s.queuedConfig ?? s.config), queued: s.queuedConfig !== null }; },
  playerEdit: (state, id) => {
    const p = asS(state).players[id];
    if (!p) return null;
    const player: { id: string; name: string; status: typeof p.status; stack: number; intendedSeat?: number; requestedStack?: number; away?: boolean; spectator?: boolean } = { id: p.id, name: p.name, status: p.status, stack: p.stack };
    if (p.intendedSeat !== undefined) player.intendedSeat = p.intendedSeat;
    if (p.requestedStack !== undefined) player.requestedStack = p.requestedStack;
    if (p.away) player.away = true;
    if (asS(state).godModeIds.includes(id)) player.spectator = true;
    const enq = p.queued.map((q) => ({ kind: "update" as const, mode: q.mode, value: q.value }));
    if (p.removeQueued) enq.push({ kind: "remove" } as never);
    return { player, enqueuedChanges: enq };
  },
  _debugDeck: (state: TableState): CardCode[] | null => asS(state).hand?.deck ?? null
};

export { equity } from "./equity.js";
export { uniformInt, shuffle, newSalt } from "./rng.js";
export { bestFive, scoreCodes } from "./eval/evaluate.js";
export { logName, chipName } from "./eval/names.js";
export { tuning } from "./placeholders.js";
export { L as logText } from "./logText.js";
