import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button1 } from "./Button1";
import { overlayStore } from "./overlay";
import { useModalLock } from "./modalLock";
import { Scrim } from "./Scrim";

/** Renders the alert/confirm queue (one at a time) as white `alert-1` cards over a scrim. Mount once at the app root. */
export function OverlayHost() {
  const items = useSyncExternalStore(overlayStore.subscribe, overlayStore.get, overlayStore.get);
  const item = items[0];
  const [checked, setChecked] = useState(false);
  useModalLock(!!item);
  useEffect(() => setChecked(false), [item?.id]);
  useEffect(() => {
    if (!item) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      done(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);
  if (!item || typeof document === "undefined") return null;

  function done(ok: boolean) {
    if (!item) return;
    overlayStore.shift(item.id);
    if (item.kind === "alert") item.resolve();
    else item.resolve(ok ? { ok: true, confirmed: true, checked } : false);
  }

  const isConfirm = item.kind === "confirm";
  const message = isConfirm ? item.opts.message : item.message;
  return createPortal(
    <Scrim className="pt-overlay-scrim" onClick={() => done(false)}>
      <div className="alert-1" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {isConfirm && item.opts.title ? <div className="alert-1-title">{item.opts.title}</div> : null}
        <div className="alert-1-message">{message}</div>
        {isConfirm && item.opts.checkbox ? (
          <label className="alert-1-checkbox">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> {item.opts.checkbox}
          </label>
        ) : null}
        <div className="alert-1-buttons">
          {isConfirm ? (
            <Button1 color="red" highlighted onClick={() => done(false)}>
              {item.opts.cancelLabel ?? "Cancel"}
            </Button1>
          ) : null}
          <Button1 color="green" highlighted onClick={() => done(true)} autoFocus>
            {isConfirm ? (item.opts.confirmLabel ?? "Confirm") : item.okLabel}
          </Button1>
        </div>
      </div>
    </Scrim>,
    document.body
  );
}
