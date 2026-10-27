import { showAlert as coreAlert, showConfirm as coreConfirm, useModalLock } from "../core/ui";
import { S } from "./strings";

/**
 * INTEGRATION: the single alert/confirm system is `core/ui` (OverlayHost, mounted once in App, SPEC 4.9 look).
 * This module only adapts the menus' call sites: showConfirm resolves `{ok, checked}` here (core resolves `false | {...}`).
 */
export function showAlert(message: string, opts: { ok?: string } = {}): Promise<void> {
  return coreAlert(message, { ok: opts.ok ?? S.ok });
}

export async function showConfirm(o: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  checkbox?: string;
}): Promise<{ ok: boolean; checked: boolean }> {
  const r = await coreConfirm({
    ...(o.title !== undefined ? { title: o.title } : {}),
    message: o.message,
    confirmLabel: o.confirmLabel ?? S.confirm,
    cancelLabel: o.cancelLabel ?? S.cancel,
    ...(o.checkbox !== undefined ? { checkbox: o.checkbox } : {})
  });
  return r ? { ok: true, checked: r.checked } : { ok: false, checked: false };
}

/** Renders nothing; holds the hotkey modal lock while mounted. */
export function ModalLock() {
  useModalLock();
  return null;
}

/** Kept for API compatibility: dialogs are rendered by core/ui OverlayHost. */
export function DialogHost() {
  return null;
}

export function dialogQueueLength(): number {
  return 0;
}
