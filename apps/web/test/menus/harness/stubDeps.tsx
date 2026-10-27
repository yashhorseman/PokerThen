import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_PREFS, type ChatMessage, type Frame, type Prefs } from "@pokerthen/shared";
import { OWNER, makeFrame } from "./mockData";

/** Throwaway dev harness replacing menus/deps.ts (sibling workstreams not required). */
export interface Harness {
  frame: Frame;
  orientation: "landscape" | "portrait";
  prefs: Prefs;
  chat: ChatMessage[];
  muted: string[];
  calls: Array<[string, unknown[]]>;
  tableStatus: "waiting" | "inProgress";
  failNext: string | null;
  seatResult: unknown;
  quick: Array<{ playerId: string; name: string; stack: number; seat: number }>;
}
const g = globalThis as unknown as { __h?: Harness; __subs?: Set<() => void> };
export function harness(): Harness {
  if (!g.__h)
    g.__h = { frame: makeFrame(), orientation: "landscape", prefs: { ...DEFAULT_PREFS }, chat: [], muted: [], calls: [], tableStatus: "waiting", failNext: null, seatResult: { ok: true }, quick: [] };
  return g.__h;
}
g.__subs ??= new Set();
export const touch = () => {
  g.__h = { ...harness() };
  g.__subs!.forEach((f) => f());
};
const sub = (f: () => void) => (g.__subs!.add(f), () => g.__subs!.delete(f));
const useH = () => useSyncExternalStore(sub, harness, harness);

export function useFrame() {
  return useH().frame;
}
export function useOrientation() {
  return useH().orientation;
}
export function useServerNow() {
  return () => Date.now();
}
export function useTableVM() {
  const h = useH();
  const f = h.frame;
  const owner = f.you?.id === f.table.ownerId;
  return {
    orientation: h.orientation,
    gameId: "ptl_demo",
    youId: f.you!.id,
    tableStatus: h.tableStatus,
    handNumber: 4,
    spectatorMode: f.table.spectatorMode,
    config: f.table.config,
    owner: {
      isOwner: owner,
      pendingRequests: Object.values(f.players).filter((p) => p.status === "requestedGameIngress").length,
      paused: false,
      quickAcceptQueue: h.quick
    }
  } as never;
}
export function useTableActions() {
  const h = harness();
  const rec = (name: string, ret?: unknown) => async (...a: unknown[]) => {
    h.calls.push([name, a]);
    if (h.failNext === name) {
      h.failNext = null;
      const e = new Error("x") as Error & { errors?: unknown };
      e.errors = { decisionLimitSec: "invalid value" };
      throw e;
    }
    return ret as never;
  };
  return new Proxy({} as Record<string, unknown>, {
    get: (_, k: string) => {
      if (k === "requestSeat") return async (...a: unknown[]) => (h.calls.push([k, a]), h.seatResult);
      if (k === "updateGame" || k === "updatePlayer" || k === "removePlayer") return rec(k, { queued: h.tableStatus === "inProgress" });
      if (k === "sendChat") return async (t: string) => { h.calls.push([k, [t]]); h.chat = [...h.chat, { at: Date.now(), playerID: OWNER, playerName: "Yash", message: t }]; touch(); };
      if (k === "toggleMute") return async (id: string) => { h.calls.push([k, [id]]); h.muted = h.muted.includes(id) ? h.muted.filter((x) => x !== id) : [...h.muted, id]; touch(); };
      return rec(k);
    }
  }) as never;
}
export function useChatVM() {
  const h = useH();
  return { messages: h.chat, unread: 0, mutedIds: h.muted, guestsAllowed: true, youCanChat: true, recording: true, names: { bobIdBBBBB: "Bob" } } as never;
}
export function usePrefs() {
  const h = useH();
  return [h.prefs, { get: () => harness().prefs, set: (p: Partial<Prefs>) => { harness().prefs = { ...harness().prefs, ...p }; touch(); }, subscribe: () => () => undefined }] as never;
}
export function useHotkey(key: string, fn: () => void, opts?: { enabled?: boolean }) {
  useEffect(() => {
    if (opts?.enabled === false) return;
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === key) fn();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
}
export function useModalLock() {}
const NAMES: Record<string, string> = { clock: "◔", chat: "✉" };
export function Icon({ name }: { name: string }) {
  return <span className="icon-stub">{NAMES[name] ?? name}</span>;
}

export function useTableData(): never {
  return {} as never; // harness injects setMenusApi
}
