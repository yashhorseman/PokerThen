/**
 * The ONLY place W6 touches sibling workstreams (ARCHITECTURE 10.1 / 13). The test harness
 * (test/phone/harness) swaps `../core/hooks` and `../core/ui` for mocks through a Vite plugin.
 */
export { useTableVM, useTableActions, usePrefs, useServerNow, useOrientation, useHotkey, useBetPanelVM } from "../core/hooks";
export { showConfirm } from "../core/ui";
