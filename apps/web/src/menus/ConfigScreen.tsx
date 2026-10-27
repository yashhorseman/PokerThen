import { useEffect } from "react";
import { useTableVM } from "./deps";
import { closeConfig, setMenuState, useMenuState, type ConfigTab } from "./store";
import { ModalLock } from "./dialogs";
import { EditPlayer } from "./EditPlayer";
import { GameSettings } from "./GameSettings";
import { PlayersList } from "./PlayersList";
import { Preferences } from "./Preferences";
import { S } from "./strings";

/** Full-screen config overlay over the table (SPEC 9.2). Mounted by W4's TableScreen; renders nothing when closed. */
export function ConfigScreen() {
  const st = useMenuState();
  if (!st.configOpen) return null;
  return <ConfigScreenOpen tab={st.configTab} editPlayerId={st.editPlayerId} />;
}

function ConfigScreenOpen({ tab, editPlayerId }: { tab: ConfigTab; editPlayerId: string | null }) {
  const vm = useTableVM();
  const owner = vm.owner.isOwner;
  const active: ConfigTab = tab === "players" && !owner ? "game" : tab;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".pt-dialog-layer")) return; // dialogs consume Esc first
      if (editPlayerId) setMenuState({ editPlayerId: null });
      else closeConfig();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editPlayerId]);
  const tabBtn = (t: ConfigTab, label: string) => (
    <button type="button" key={t} className={`config-top-tab-buttton${active === t ? " active" : ""}`} onClick={() => setMenuState({ configTab: t, editPlayerId: null })}>
      {label}
    </button>
  );
  return (
    <div className="config-screen" role="dialog" aria-label={S.gameConfigurations}>
      <ModalLock />
      <div className="config-top-tabs">
        <button type="button" className="config-top-tab-buttton back" onClick={closeConfig}>{S.back}</button>
        {owner ? tabBtn("players", S.players) : null}
        {tabBtn("game", S.game)}
        {tabBtn("preferences", S.preferences)}
      </div>
      {active === "players" ? (editPlayerId ? <EditPlayer playerId={editPlayerId} /> : <PlayersList />) : null}
      {active === "game" ? <GameSettings /> : null}
      {active === "preferences" ? <Preferences /> : null}
    </div>
  );
}
