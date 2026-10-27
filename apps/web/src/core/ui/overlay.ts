/** Imperative alert/confirm queue (SPEC 4.9, ARCH 10.1). Rendered by <OverlayHost/>. */
export interface ConfirmResult {
  ok: true;
  confirmed: true;
  checked: boolean;
}
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  checkbox?: string;
}
export type OverlayItem =
  | { id: number; kind: "alert"; message: string; okLabel: string; resolve: () => void }
  | { id: number; kind: "confirm"; opts: ConfirmOptions; resolve: (r: ConfirmResult | false) => void };

let queue: OverlayItem[] = [];
let seq = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export const overlayStore = {
  get: (): OverlayItem[] => queue,
  subscribe(fn: () => void): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  /** removes the item and resolves nothing (host calls item.resolve itself) */
  shift(id: number): void {
    queue = queue.filter((i) => i.id !== id);
    emit();
  }
};

export function showAlert(message: string, opts: { ok?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    queue = [...queue, { id: seq++, kind: "alert", message, okLabel: opts.ok ?? "OK", resolve }];
    emit();
  });
}

/** Resolves `false` on cancel/Esc; on confirm an object `{ok, confirmed, checked}` (truthy). */
export function showConfirm(opts: ConfirmOptions): Promise<ConfirmResult | false> {
  return new Promise((resolve) => {
    queue = [...queue, { id: seq++, kind: "confirm", opts, resolve }];
    emit();
  });
}

/** Toast = alert (ARCH 10.1). */
export const showToast = showAlert;
