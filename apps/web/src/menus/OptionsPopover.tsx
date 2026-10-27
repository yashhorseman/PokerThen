import { useEffect, useRef } from "react";
import { useTableVM } from "./deps";
import { closeConfig, getMenuState, openConfig, setMenuState, useMenuState } from "./store";
import { S } from "./strings";

/** Red circular badge: number of pending seat requests (owner only). Render inside `.top-buttons-button.options`. */
export function OptionsBadge() {
  const vm = useTableVM();
  const n = vm.owner.isOwner ? vm.owner.pendingRequests : 0;
  if (!n) return null;
  return <span className="pt-options-badge" aria-label={`${n} pending`}>{n}</span>;
}

/**
 * `.popover-1.top-controls-options-popover`. W5's Options button toggles it with `toggleOptions()` and renders
 * `<OptionsPopover />` inside the top-left column (position by CSS; opens right on desktop, down on phone).
 */
export function toggleOptions(): void {
  setMenuState({ optionsOpen: !getMenuState().optionsOpen });
}

export function OptionsPopover({ onNavigateHome }: { onNavigateHome?: () => void }) {
  const vm = useTableVM();
  const { optionsOpen } = useMenuState();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!optionsOpen) return;
    const onDown = (e: Event) => {
      const t = e.target as Element | null;
      if (ref.current?.contains(t as Node) || t?.closest?.(".top-buttons-button.options")) return;
      setMenuState({ optionsOpen: false });
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuState({ optionsOpen: false });
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [optionsOpen]);
  if (!optionsOpen) return null;
  const goHome = () => (onNavigateHome ? onNavigateHome() : window.location.assign("/home"));
  return (
    <div ref={ref} className="popover-1 top-controls-options-popover" role="menu">
      <span className="popover-arrow" />
      <button type="button" className="button-1 gray pt-opt" onClick={() => { setMenuState({ optionsOpen: false }); goHome(); }}>
        {S.home}
      </button>
      <button type="button" className="button-1 pt-opt" onClick={() => openConfig("game")}>
        {S.gameConfigurations}
      </button>
      {vm.owner.isOwner ? (
        <button type="button" className="button-1 pt-opt" onClick={() => openConfig("players")}>
          {S.players}
          {vm.owner.pendingRequests ? <span className="pt-bubble">{vm.owner.pendingRequests}</span> : null}
        </button>
      ) : null}
      <button type="button" className="button-1 pt-opt" onClick={() => openConfig("preferences")}>
        {S.preferences}
      </button>
    </div>
  );
}
export { closeConfig };
