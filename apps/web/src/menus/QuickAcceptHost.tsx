import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFrame, useTableActions, useTableVM, usePrefs } from "./deps";
import { DialogHost, ModalLock, showAlert } from "./dialogs";
import { digitsOnly } from "./logic";
import { FUNCS, S } from "./strings";
import { PLACEHOLDERS } from "@pokerthen/shared";

function host(): Element | null {
  return typeof document === "undefined" ? null : document.getElementById("canvas") ?? document.body;
}

/** Owner: one seat request at a time (SPEC 2.4). */
function QuickAccept() {
  const vm = useTableVM();
  const actions = useTableActions();
  const [prefs, prefsApi] = usePrefs();
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [stack, setStack] = useState<{ id: string; v: string } | null>(null);
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const req = vm.owner.isOwner && prefs.showQuickAcceptPlayer ? vm.owner.quickAcceptQueue.find((r) => !ignored.has(r.playerId)) : undefined;
  const h = host();
  if (!req || !h) return null;
  const value = stack && stack.id === req.playerId ? stack.v : String(req.stack);
  const finish = () => {
    if (skip) prefsApi.set({ showQuickAcceptPlayer: false });
    setSkip(false);
    setStack(null);
  };
  const accept = async () => {
    setBusy(true);
    try {
      await actions.approvePlayer(req.playerId, value === "" ? undefined : Number(value));
      finish();
      await showAlert(S.approvedOk);
    } catch {
      await showAlert(S.acceptFail);
    } finally {
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await actions.rejectPlayer(req.playerId);
      finish();
      await showAlert(S.rejectedOk);
    } catch {
      await showAlert(S.rejectFail);
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="pt-dialog-layer pt-quick-accept">
      <ModalLock />
      <div className="pt-scrim" />
      <div className="alert-1 pt-alert quick-accept" role="dialog" aria-modal="true">
        <h3 className="pt-alert-title">{FUNCS.wantsToJoin(req.name)}</h3>
        <div className="alert-1-message">
          <label htmlFor="pt-qa-stack">{S.intendedStack}</label>
          <input id="pt-qa-stack" type="text" inputMode="numeric" value={value} onChange={(e) => setStack({ id: req.playerId, v: digitsOnly(e.target.value) })} />
        </div>
        <label className="pt-alert-check">
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> {S.doNotShow}
        </label>
        <div className="alert-1-buttons">
          <button type="button" className="button-1 red pt-btn" disabled={busy} onClick={reject}>{S.reject}</button>
          <button type="button" className="button-1 red pt-btn" disabled={busy} onClick={() => { setIgnored(new Set(ignored).add(req.playerId)); finish(); }}>{S.ignore}</button>
          <button type="button" className="button-1 green highlighted pt-btn" disabled={busy} onClick={accept}>{S.accept}</button>
        </div>
      </div>
    </div>,
    h
  );
}

/** Busted player decision and owner approval dialogs, driven by `vm.rebuy` (RebuyVM). Timers U-R1. */
function RebuyDialogs() {
  const vm = useTableVM();
  const actions = useTableActions();
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const h = host();
  const rb = vm.rebuy;
  const dlgKey = rb ? (rb.phase === "decision" && rb.youDecide ? `ask-${vm.handNumber}` : rb.phase === "approval" && vm.owner.isOwner && rb.ownerRequests[0] ? `app-${vm.handNumber}-${rb.ownerRequests[0].playerId}` : null) : null;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (dlgKey !== lastKey.current) { lastKey.current = dlgKey; setVal(""); } // a new dialog must not inherit the previous text
  }, [dlgKey]);
  if (!rb || !h) return null;
  const secs = rb.secondsLeft ?? PLACEHOLDERS.REBUY_DECISION_SEC; // U-R1
  const asking = rb.phase === "decision" && rb.youDecide;
  const req = rb.phase === "approval" && vm.owner.isOwner ? rb.ownerRequests[0] : undefined;
  const key = asking ? `ask-${vm.handNumber}` : req ? `app-${vm.handNumber}-${req.playerId}` : null;
  if (!key || dismissed === key) return null;
  if (asking) {
    const send = async () => {
      setBusy(true);
      try {
        await actions.requestRebuy(Number(val || 0));
        setDismissed(key);
      } catch {
        await showAlert(S.rebuyReqFail);
      } finally {
        setBusy(false);
      }
    };
    return createPortal(
      <div className="pt-dialog-layer pt-rebuy">
        <ModalLock />
        <div className="pt-scrim" />
        <div className="alert-1 pt-alert" role="dialog" aria-modal="true">
          <h3 className="pt-alert-title">{S.rebuyTitle}</h3>
          <div className="alert-1-message">
            <p className="pt-hint">{`${S.availableValues} 1 - 1.000.000`}</p>
            <label htmlFor="pt-rebuy-stack">{S.intendedStack}</label>
            <input id="pt-rebuy-stack" type="text" inputMode="numeric" value={val} onChange={(e) => setVal(digitsOnly(e.target.value))} />
          </div>
          <p className="pt-hint">{FUNCS.secondsDecision(secs)}</p>
          <div className="alert-1-buttons">
            <button type="button" className="button-1 red pt-btn" onClick={() => setDismissed(key)}>{S.cancel}</button>
            <button type="button" className="button-1 green highlighted pt-btn" disabled={busy} onClick={send}>{S.confirm}</button>
          </div>
        </div>
      </div>,
      h
    );
  }
  const requested = req!.requestedStack ?? 0;
  const approveVal = val === "" ? String(requested) : val;
  const resolve = async (approve: boolean) => {
    setBusy(true);
    try {
      await actions.resolveRebuy(req!.playerId, approve, approve ? Number(approveVal) : undefined);
      setDismissed(key);
    } catch {
      await showAlert(S.rebuyResolveFail);
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div className="pt-dialog-layer pt-rebuy">
      <ModalLock />
      <div className="pt-scrim" />
      <div className="alert-1 pt-alert" role="dialog" aria-modal="true">
        <h3 className="pt-alert-title">{FUNCS.rebuyRequested(req!.name)}</h3>
        <div className="alert-1-message">
          <label htmlFor="pt-rebuy-approve">{S.approvedStack}</label>
          <input id="pt-rebuy-approve" type="text" inputMode="numeric" value={approveVal} onChange={(e) => setVal(digitsOnly(e.target.value))} />
          <p className="pt-hint">{FUNCS.requestedStack(requested)}</p>
        </div>
        <div className="alert-1-buttons">
          <button type="button" className="button-1 red pt-btn" disabled={busy} onClick={() => resolve(false)}>{S.cancel}</button>
          <button type="button" className="button-1 green highlighted pt-btn" disabled={busy} onClick={() => resolve(true)}>{S.approve}</button>
        </div>
      </div>
    </div>,
    h
  );
}

/** Non-owner: modal when new players are granted spectator rights (SPEC 8). */
function SpectatorWarning() {
  const vm = useTableVM();
  const frame = useFrame();
  const prev = useRef<string[] | null>(null);
  const [names, setNames] = useState<string[] | null>(null);
  const h = host();
  const ids = frame?.table.godModeIds;
  useEffect(() => {
    if (!frame || !ids) return;
    if (prev.current && !vm.owner.isOwner) {
      const added = ids.filter((i) => !prev.current!.includes(i));
      if (added.length) setNames(added.map((i) => frame.players[i]?.name ?? i));
    }
    prev.current = [...ids];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids?.join(",")]);
  if (!names || !h) return null;
  return createPortal(
    <div className="pt-dialog-layer pt-spectator-warning">
      <ModalLock />
      <div className="pt-scrim" />
      <div className="alert-1 pt-alert" role="dialog" aria-modal="true">
        <div className="alert-1-message">{FUNCS.spectatorWarning(names.join(", "))}</div>
        <div className="alert-1-buttons">
          <button type="button" className="button-1 green highlighted pt-btn" onClick={() => setNames(null)}>{S.spectatorAware}</button>
        </div>
      </div>
    </div>,
    h
  );
}

/** Always-mounted overlay host (W4 mounts it in TableScreen): quick accept queue, rebuy dialogs, spectator warning, alerts. */
export function QuickAcceptHost() {
  return (
    <>
      <QuickAccept />
      <RebuyDialogs />
      <SpectatorWarning />
      <DialogHost />
    </>
  );
}
