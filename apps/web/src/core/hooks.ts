import { useCallback, useSyncExternalStore } from "react";
import type {
  AudioApi,
  BetPanelVM,
  ChatVM,
  Frame,
  Orientation,
  Prefs,
  PrefsApi,
  TableActions,
  TableDataApi,
  TableViewModel
} from "@pokerthen/shared";
import { useOrientationValue } from "./canvas/orientation";
export { useHotkey } from "./hotkeys";
import { useRuntime } from "./Provider";
import type { HttpApi } from "./api/client";
import type { Intent } from "./store/intent";

/** Hooks are the ONLY way components get data (ARCH 10.1). */
export function useTableVM(): TableViewModel {
  const rt = useRuntime();
  return useSyncExternalStore(rt.subscribe, rt.getVM, rt.getVM);
}
export function useBetPanelVM(): BetPanelVM | null {
  const rt = useRuntime();
  return useSyncExternalStore(rt.subscribe, rt.getBetPanel, rt.getBetPanel);
}
export function useTableActions(): TableActions {
  return useRuntime().actions;
}
/** raw frame: read-only escape hatch for menus/ledger */
export function useFrame(): Frame | null {
  const rt = useRuntime();
  const get = () => rt.store.getState().frame;
  return useSyncExternalStore(rt.store.subscribe, get, get);
}
export function useChatVM(): ChatVM {
  const rt = useRuntime();
  const get = useCallback((): ChatVM => chatVM(rt), [rt]);
  return useSyncExternalStore(rt.subscribe, () => cachedChat(rt, get), () => cachedChat(rt, get));
}
const chatCache = new WeakMap<object, { state: unknown; frame: unknown; vm: ChatVM }>();
function cachedChat(rt: ReturnType<typeof useRuntime>, make: () => ChatVM): ChatVM {
  const s = rt.store.getState();
  const c = chatCache.get(rt);
  if (c && c.state === s) return c.vm;
  const vm = make();
  const prev = c?.vm;
  const same =
    prev &&
    prev.messages === vm.messages &&
    prev.unread === vm.unread &&
    prev.mutedIds === vm.mutedIds &&
    prev.guestsAllowed === vm.guestsAllowed &&
    prev.youCanChat === vm.youCanChat &&
    prev.recording === vm.recording &&
    JSON.stringify(prev.names) === JSON.stringify(vm.names);
  const out = same ? prev : vm;
  chatCache.set(rt, { state: s, frame: s.frame, vm: out });
  return out;
}
function chatVM(rt: ReturnType<typeof useRuntime>): ChatVM {
  const s = rt.store.getState();
  const f = s.frame;
  const names: Record<string, string> = {};
  for (const m of s.chat) if (m.playerID) names[m.playerID] = m.playerName;
  if (f) for (const p of Object.values(f.players)) names[p.id] = p.name;
  const isOwner = !!f && f.table.ownerId === s.you?.id;
  return {
    messages: s.chat,
    unread: s.unread,
    mutedIds: s.you?.mutedIds ?? EMPTY,
    guestsAllowed: f?.table.config.guestChat ?? true,
    youCanChat: isOwner || (f?.table.config.guestChat ?? true),
    recording: f?.table.config.recordChat ?? false,
    names
  };
}
const EMPTY: string[] = [];

/** chat panel controls (extra to ChatVM): call setOpen(true) while the chat is visible so unread resets */
export function useChatControls(): { setOpen(open: boolean): void; markRead(): void } {
  const rt = useRuntime();
  return { setOpen: (o) => rt.store.setChatOpen(o), markRead: () => rt.store.markChatRead() };
}

export function usePrefs(): [Prefs, PrefsApi] {
  const rt = useRuntime();
  const p = useSyncExternalStore(rt.prefs.subscribe, rt.prefs.get, rt.prefs.get);
  return [p, rt.prefs];
}
export function useAudio(): AudioApi {
  return useRuntime().audio();
}
export function useServerNow(): () => number {
  return useRuntime().store.clock.now;
}
export function useOrientation(): Orientation {
  return useOrientationValue();
}
/** menus: log, ledger, configs, player edit (no component calls fetch) */
export function useTableData(): TableDataApi {
  return useRuntime().api.tableData();
}
/** full HTTP client incl. fairness/currentPlayerInfos */
export function useTableApi(): HttpApi {
  return useRuntime().api;
}
export function useIntent(): Intent | null {
  const rt = useRuntime();
  return useSyncExternalStore(rt.intents.subscribe, rt.intents.get, rt.intents.get);
}
