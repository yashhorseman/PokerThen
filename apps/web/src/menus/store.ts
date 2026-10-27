import { useSyncExternalStore } from "react";

/** Tiny shared UI state for menus (config screen, log modal, options popover). No sockets, no fetch. */
export type ConfigTab = "players" | "game" | "preferences";
export type LogTab = "log" | "ledger";

export interface MenuState {
  configOpen: boolean;
  configTab: ConfigTab;
  editPlayerId: string | null;
  optionsOpen: boolean;
  logOpen: boolean;
  logTab: LogTab;
  chatOpen: boolean;
  composeOpen: boolean;
}

let state: MenuState = {
  configOpen: false,
  configTab: "game",
  editPlayerId: null,
  optionsOpen: false,
  logOpen: false,
  logTab: "log",
  chatOpen: false,
  composeOpen: false
};
const subs = new Set<() => void>();

export function getMenuState(): MenuState {
  return state;
}
export function setMenuState(patch: Partial<MenuState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function subscribeMenu(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function useMenuState(): MenuState {
  return useSyncExternalStore(subscribeMenu, getMenuState, getMenuState);
}

export function openConfig(tab: ConfigTab = "game"): void {
  setMenuState({ configOpen: true, configTab: tab, editPlayerId: null, optionsOpen: false });
}
export function closeConfig(): void {
  setMenuState({ configOpen: false, editPlayerId: null });
}
export function openLog(tab: LogTab = "log"): void {
  setMenuState({ logOpen: true, logTab: tab });
}
export function closeLog(): void {
  setMenuState({ logOpen: false });
}
/** any menus overlay that should block table hotkeys */
export function anyMenuOpen(s: MenuState = state): boolean {
  return s.configOpen || s.logOpen || s.composeOpen || s.optionsOpen;
}

/** Open the config screen straight on a player's Edit screen (owner-only seat menu item, SPEC 4.5). */
export function openEditPlayer(playerId: string): void {
  setMenuState({ configOpen: true, configTab: "players", editPlayerId: playerId, optionsOpen: false });
}
