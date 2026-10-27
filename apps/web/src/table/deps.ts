/**
 * Single seam for everything W5 consumes from other workstreams (ARCH 10.1 / 13).
 * Only documented entry points: core/hooks, core/ui, art/index, menus/index.
 */
export {
  useTableVM, useTableActions, useChatVM, usePrefs, useAudio, useServerNow, useOrientation, useHotkey, useFrame
} from "../core/hooks";
export { Button1, showAlert, showConfirm } from "../core/ui";
export { Icon, SuitIcon, CardBack, FeltDesktop, FeltPhone, RoomBackground, DealerDisc, SeatSlot, Logo } from "../art";
export type { IconName } from "../art";
export { SitPopover, openEditPlayer, OptionsPopover, OptionsBadge, toggleOptions } from "../menus";
