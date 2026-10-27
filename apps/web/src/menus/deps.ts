/**
 * The ONLY file in menus/ that imports sibling workstreams (W4 core hooks, W8 art, W6 phone).
 * Tests/dev harness replace this module (vi.mock / vite alias) so menus can be built before siblings land.
 */
export {
  useTableVM,
  useTableActions,
  useChatVM,
  usePrefs,
  useServerNow,
  useOrientation,
  useHotkey,
  useFrame,
  useTableData
} from "../core/hooks";
export { useModalLock } from "../core/ui";
export { Icon } from "../art";
