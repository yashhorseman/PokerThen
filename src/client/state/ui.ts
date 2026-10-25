import { createStore } from './createStore';

/**
 * Overlay / dialog state shared between the table scene (src/client/table, which opens things)
 * and the overlay host (src/client/shell/OverlayHost.tsx, which renders them).
 */
export type ConfigTab = 'players' | 'game' | 'preferences' | 'video';
export type LogTab = 'log' | 'ledger' | 'replayer';

export interface AlertSpec { id: number; title?: string; text: string; okLabel?: string; resolve: () => void }
export interface ConfirmSpec {
  id: number; title?: string; text: string; subtext?: string; confirmLabel?: string; cancelLabel?: string;
  /** red CANCEL / green CONFIRM like the reference */
  resolve: (ok: boolean) => void;
}

export interface UiState {
  optionsOpen: boolean; //                       Options popover (top-left)
  config: { tab: ConfigTab; editPlayerId: string | null } | null; // full-screen config screens ("« BACK" returns)
  seatPopover: number | null; //                 seat number whose Sit popover is open
  logModal: { tab: LogTab; hand: number | null } | null;
  chatSheetOpen: boolean; //                     phone bottom sheet
  chatComposeOpen: boolean; //                   desktop compose popover
  /** which pending seat-request the owner Quick-Accept modal shows (id) and which were ignored locally */
  ignoredRequestIds: string[];
  alerts: AlertSpec[];
  confirms: ConfirmSpec[];
  toasts: Array<{ id: number; text: string }>;
  tosAccepted: boolean;
  /** true while any modal/popover/input has focus -> table hotkeys disabled */
  hotkeysLocked: boolean;
}

export const uiStore = createStore<UiState>({
  optionsOpen: false, config: null, seatPopover: null, logModal: null, chatSheetOpen: false, chatComposeOpen: false,
  ignoredRequestIds: [], alerts: [], confirms: [], toasts: [], tosAccepted: false, hotkeysLocked: false,
});
export const useUi = uiStore.useStore;
export const ui = {
  set: uiStore.setState,
  openOptions: () => uiStore.setState({ optionsOpen: true }),
  closeOptions: () => uiStore.setState({ optionsOpen: false }),
  openConfig: (tab: ConfigTab = 'game', editPlayerId: string | null = null) => uiStore.setState({ config: { tab, editPlayerId }, optionsOpen: false }),
  closeConfig: () => uiStore.setState({ config: null }),
  openSeat: (seat: number | null) => uiStore.setState({ seatPopover: seat }),
  openLog: (tab: LogTab = 'log', hand: number | null = null) => uiStore.setState({ logModal: { tab, hand } }),
  closeLog: () => uiStore.setState({ logModal: null }),
};

let nextId = 1;
/** window.alert style dialog (white card, green OK). Resolves when closed. */
export function showAlert(text: string, opts: { title?: string; okLabel?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    const id = nextId++;
    uiStore.setState((s) => ({ alerts: [...s.alerts, { id, text, ...opts, resolve: () => { uiStore.setState((x) => ({ alerts: x.alerts.filter((a) => a.id !== id) })); resolve(); } }] }));
  });
}
/** confirm dialog (red CANCEL / green CONFIRM). Resolves true on confirm. */
export function showConfirm(text: string, opts: { title?: string; subtext?: string; confirmLabel?: string; cancelLabel?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const id = nextId++;
    uiStore.setState((s) => ({ confirms: [...s.confirms, { id, text, ...opts, resolve: (ok) => { uiStore.setState((x) => ({ confirms: x.confirms.filter((c) => c.id !== id) })); resolve(ok); } }] }));
  });
}
/** small non-blocking toast (e.g. "You are now seeing the values as big blinds, to toggle it, press b") */
export function showToast(text: string, ms = 3500) {
  const id = nextId++;
  uiStore.setState((s) => ({ toasts: [...s.toasts, { id, text }] }));
  setTimeout(() => uiStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
