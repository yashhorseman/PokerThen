import { useSyncExternalStore } from "react";
import { DEFAULT_PREFS, type Prefs, type TableViewModel } from "@pokerthen/shared";

type L = () => void;
const listeners = new Set<L>();
let vm: TableViewModel | null = null;
let prefs: Prefs = { ...DEFAULT_PREFS };
export const calls: string[] = [];
(window as unknown as Record<string, unknown>).__calls = calls;
export const setVM = (v: TableViewModel) => { vm = v; listeners.forEach((l) => l()); };
const sub = (l: L) => { listeners.add(l); return () => listeners.delete(l); };

export function useTableVM(): TableViewModel {
  return useSyncExternalStore(sub, () => vm!);
}
const actions = new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => { calls.push(`${k}(${a.map((x) => JSON.stringify(x)).join(",")})`); return k === "startGame" ? Promise.resolve() : undefined; } }) as never;
export const useTableActions = () => actions;
export const useChatVM = () => ({ messages: [], unread: 0, mutedIds: [], guestsAllowed: true, youCanChat: true, recording: false, names: {} });
export const usePrefs = (): [Prefs, { get(): Prefs; set(p: Partial<Prefs>): void; subscribe(): () => void }] => [prefs, { get: () => prefs, set: (p) => { prefs = { ...prefs, ...p }; listeners.forEach((l) => l()); }, subscribe: () => () => undefined }];
export const useAudio = () => ({ unlock() {}, play(n: string) { calls.push(`play:${n}@${Math.round(performance.now())}`); }, setVolume() {}, setSecondaryDisabled() {}, setChatBeepDisabled() {} });
export const useServerNow = () => () => Date.now();
export const useOrientation = () => useTableVM().orientation;
export const useHotkey = () => undefined;
export const useFrame = () => null;
