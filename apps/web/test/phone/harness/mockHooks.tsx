import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_PREFS, type Frame, type Orientation, type Prefs, type TableActions, type TableViewModel } from "@pokerthen/shared";

type Listener = () => void;
const listeners = new Set<Listener>();
export const store: { vm: TableViewModel | null; frame: Frame | null; prefs: Prefs; calls: Array<{ fn: string; args: unknown[] }> } = {
  vm: null,
  frame: null,
  prefs: { ...DEFAULT_PREFS, autoActivateTimeBank: false },
  calls: []
};
let version = 0;
export function setVM(vm: TableViewModel) {
  store.vm = vm;
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: Listener) => (listeners.add(l), () => listeners.delete(l));
const snap = () => version;
function useStore() {
  useSyncExternalStore(subscribe, snap);
}

const actions = new Proxy({} as TableActions, {
  get: (_t, prop: string) => (...args: unknown[]) => {
    store.calls.push({ fn: prop, args });
    (window as unknown as { __calls: unknown }).__calls = store.calls;
    return Promise.resolve(undefined);
  }
});

export function useTableVM(): TableViewModel {
  useStore();
  return store.vm!;
}
export function useTableActions(): TableActions {
  return actions;
}
export function usePrefs(): [Prefs, { get(): Prefs; set(p: Partial<Prefs>): void; subscribe(): () => void }] {
  useStore();
  return [store.prefs, { get: () => store.prefs, set: () => {}, subscribe: () => () => {} }];
}
export function useServerNow(): () => number {
  return () => Date.now();
}
export function useOrientation(): Orientation {
  useStore();
  return store.vm!.orientation;
}
export function useFrame(): Frame | null {
  useStore();
  return store.frame;
}
export const hotkeys = new Map<string, () => void>();
export function useHotkey(key: string, handler: () => void) {
  useEffect(() => {
    hotkeys.set(key, handler);
    (window as unknown as { __hotkeys: unknown }).__hotkeys = hotkeys;
    return () => void hotkeys.delete(key);
  });
}
export function useChatVM() {
  return { messages: [], unread: 0, mutedIds: [], guestsAllowed: true, youCanChat: true, recording: false, names: {} };
}
export function useAudio() {
  return { unlock() {}, play() {}, setVolume() {}, setSecondaryDisabled() {}, setChatBeepDisabled() {} };
}
export function useBetPanelVM() {
  useStore();
  return ((store.vm as unknown as { betPanel?: unknown })?.betPanel ?? null) as import("@pokerthen/shared").BetPanelVM | null;
}
