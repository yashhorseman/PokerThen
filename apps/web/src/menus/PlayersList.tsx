import { useState } from "react";
import { useFrame, useTableActions } from "./deps";
import { showAlert } from "./dialogs";
import { orderPlayers, playerStatusText } from "./logic";
import { setMenuState } from "./store";
import { S, FUNCS } from "./strings";

export function PlayersList() {
  const frame = useFrame();
  const actions = useTableActions();
  const [busy, setBusy] = useState<string | null>(null);
  if (!frame) return <div className="config-content"><p>{S.loadingPlease}</p></div>;
  const list = orderPlayers(frame.players);
  const you = frame.you?.id;
  const deny = async (id: string) => {
    setBusy(id);
    try {
      await actions.rejectPlayer(id);
      await showAlert(S.rejectedToast);
    } catch {
      await showAlert(S.whoops);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="config-content config-players">
      {list.map((p) => {
        const pending = p.status === "requestedGameIngress";
        const spectator = frame.table.godModeIds.includes(p.id);
        return (
          <div key={p.id} className={`config-player-row${pending ? " request-game-ingress" : ""}`} data-player-id={p.id}>
            <p className="name">
              {p.name || S.guest} <small>{FUNCS.idChip(p.id)}</small>
              {p.id === you ? null : null}
            </p>
            <p className="status">{playerStatusText(p)}</p>
            <div className="player-action-buttons">
              {pending ? (
                <>
                  <button type="button" className="button-1 green pt-btn" disabled={busy === p.id} onClick={() => setMenuState({ editPlayerId: p.id })}>
                    {busy === p.id ? S.approving : S.approve}
                  </button>
                  <button type="button" className="button-1 red pt-btn" disabled={busy === p.id} onClick={() => deny(p.id)}>
                    {S.deny}
                  </button>
                </>
              ) : (
                <>
                  {spectator ? <small className="spectator-signal">{S.allowedSpectator}</small> : null}
                  <button type="button" className="button-1 gray pt-btn" onClick={() => setMenuState({ editPlayerId: p.id })}>
                    {S.edit}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
