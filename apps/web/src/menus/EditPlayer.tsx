import { useState } from "react";
import { useFrame, useTableActions, useTableVM } from "./deps";
import { showAlert, showConfirm } from "./dialogs";
import { digitsOnly } from "./logic";
import { setMenuState } from "./store";
import { FUNCS, S } from "./strings";

type Mode = "ADD" | "REMOVE" | "SET";

export function EditPlayer({ playerId }: { playerId: string }) {
  const frame = useFrame();
  const vm = useTableVM();
  const actions = useTableActions();
  const [mode, setMode] = useState<Mode>("ADD");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const p = frame?.players[playerId];
  const close = () => setMenuState({ editPlayerId: null });
  if (!frame || !p) {
    return (
      <div className="config-content">
        <p>{S.whoops}</p>
        <button type="button" className="button-1 gray pt-btn" onClick={close}>{S.back}</button>
      </div>
    );
  }
  const approving = p.status === "requestedGameIngress";
  const isMe = playerId === frame.you?.id;
  const seated = p.status === "inGame" || p.status === "standingUp" || p.status === "waitingNextGameToEnter";
  const immediate = vm.tableStatus === "waiting" || p.status === "standingUp";
  const label = loading ? S.loadingEllipsis : approving ? (immediate ? S.approvePlayer : S.approveOnNext) : immediate ? S.updatePlayer : S.updateOnNext;
  const fail = () => showAlert(S.editError);

  const submit = async () => {
    setLoading(true);
    try {
      if (approving) {
        const n = value === "" ? p.requestedStack ?? undefined : Number(value);
        await actions.approvePlayer(playerId, n);
        await showAlert(S.playerUpdated);
        close();
      } else {
        const r = await actions.updatePlayer(playerId, mode, Number(value || 0));
        await showAlert(r.queued ? S.updatedNext : S.playerUpdated);
        setValue("");
      }
    } catch {
      await fail();
    } finally {
      setLoading(false);
    }
  };
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      await fail();
    }
  };
  const remove = async () => {
    if (!(await showConfirm({ message: S.removeConfirm })).ok) return;
    await run(async () => {
      const r = await actions.removePlayer(playerId);
      await showAlert(r.queued ? S.removedNext : S.removedNow);
    });
  };
  const transfer = async () => {
    if (!(await showConfirm({ message: S.transferConfirm })).ok) return;
    await run(async () => {
      await actions.transferOwnership(playerId);
      await showAlert(S.transferred);
    });
  };
  const isSpec = frame.table.godModeIds.includes(playerId);
  const toggleSpec = async () => {
    if (!isSpec && !(await showConfirm({ message: S.spectatorConfirm })).ok) return;
    await run(() => actions.toggleGodMode(playerId, !isSpec));
  };
  const away = async () => {
    if (!(await showConfirm({ message: S.putAwayConfirm })).ok) return;
    await run(async () => {
      await actions.putInAway(playerId);
      if (vm.tableStatus !== "waiting") await showAlert(S.putAwayToast);
    });
  };
  return (
    <div className="config-content config-edit-player row-fluid">
      <div className="col col-4 config-player-column">
        <p className="name pt-edit-header">{FUNCS.editHeader(p.name || S.guest, p.id)}</p>
        {approving ? (
          <div className="form-1-input-control">
            <label htmlFor="pt-edit-stack">{S.playersStackLabel}</label>
            <input
              id="pt-edit-stack"
              type="text"
              inputMode="numeric"
              placeholder={S.stackPlaceholder}
              value={value === "" && p.requestedStack != null ? String(p.requestedStack) : value}
              onChange={(e) => setValue(digitsOnly(e.target.value))}
            />
          </div>
        ) : (
          <fieldset className="pt-fieldset">
            <legend>{S.playerStack}</legend>
            <p className="pt-current">{FUNCS.current(p.stack)}</p>
            <div className="choose-buttons">
              {(["ADD", "REMOVE", "SET"] as Mode[]).map((m) => (
                <button key={m} type="button" className={m === mode ? "active" : ""} onClick={() => setMode(m)}>
                  {m}
                </button>
              ))}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder={S.valuePlaceholder}
              value={value}
              onChange={(e) => setValue(digitsOnly(e.target.value))}
            />
          </fieldset>
        )}
        <button type="button" className="button-1 green highlighted pt-submit" disabled={loading} onClick={submit}>
          {label}
        </button>
      </div>
      <div className="col col-2 config-player-column">
        {!isMe && seated ? (
          <button type="button" className="button-1 red pt-btn" onClick={remove}>{S.removePlayer}</button>
        ) : null}
        {!isMe ? (
          <button type="button" className="button-1 red pt-btn" onClick={transfer}>{S.transfer}</button>
        ) : null}
        {frame.table.spectatorMode ? (
          <button type="button" className="button-1 red pt-btn" onClick={toggleSpec}>
            {isSpec ? S.disallowSpectator : S.allowSpectator}
          </button>
        ) : null}
        {!isMe && p.status === "inGame" ? (
          <button type="button" className="button-1 red pt-btn" onClick={away}>{S.putAway}</button>
        ) : null}
      </div>
    </div>
  );
}
