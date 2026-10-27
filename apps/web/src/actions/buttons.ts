/** Table-driven description of the action bar (SPEC 6.1/6.2) derived from ActionBarVM. Pure. */
import type { ActionBarVM, ActionKind } from "@pokerthen/shared";

export type ButtonColor = "green" | "red" | "yellow" | "gray";
export interface ActionButtonModel {
  key: "call" | "raise" | "check" | "fold";
  label: string;
  color: ButtonColor;
  enabled: boolean;
  highlighted: boolean;
  /** extra classes on the button (SPEC: `raise`, `call`, `check`, `fold`) */
  className: string;
}

export const LOCK_MS = 750;

/** The bar always renders 4 slots in this order; disabled ones stay (opacity .25). */
export function buildActionButtons(bar: ActionBarVM, locked: boolean): ActionButtonModel[] {
  const call = bar.call;
  return [
    {
      key: "call",
      label: call ? call.label : "Call",
      color: "green",
      // a missing call button still occupies the slot but is disabled (observed `BET` disabled off-turn)
      enabled: !!call && call.enabled && !locked,
      highlighted: !!call && call.highlighted,
      className: "call"
    },
    {
      key: "raise",
      label: bar.raise.label,
      color: "green",
      enabled: bar.raise.enabled && !locked,
      highlighted: bar.raise.highlighted,
      className: "raise"
    },
    { key: "check", label: "Check", color: "green", enabled: bar.check.enabled && !locked, highlighted: bar.check.highlighted, className: "check" },
    { key: "fold", label: "Fold", color: "red", enabled: bar.fold.enabled && !locked, highlighted: bar.fold.highlighted, className: "fold" }
  ];
}

export type ClickEffect =
  | { kind: "ignore" }
  | { kind: "send"; action: "check" | "call" | "fold" }
  | { kind: "queue"; intent: ActionKind }
  | { kind: "clearIntent" }
  | { kind: "confirmFold" }
  | { kind: "openPanel" };

/**
 * What a click on a button does. Buttons never send directly when it is not your turn: they toggle a stored
 * intended action (SPEC 6.2). On your turn they send at once (fold may need the unnecessary-fold confirm).
 */
export function clickEffect(bar: ActionBarVM, key: ActionButtonModel["key"] | "checkOrFold", opts: { locked: boolean; skipFoldConfirm: boolean }): ClickEffect {
  if (opts.locked) return { kind: "ignore" };
  const kind: ActionKind = key === "checkOrFold" ? "checkOrFold" : key === "raise" ? "raise" : key;
  if (key === "checkOrFold") {
    if (!bar.checkOrFold.visible) return { kind: "ignore" };
    return bar.checkOrFold.highlighted ? { kind: "clearIntent" } : { kind: "queue", intent: "checkOrFold" };
  }
  const btn = buildActionButtons(bar, false).find((b) => b.key === key)!;
  if (!btn.enabled) return { kind: "ignore" };
  if (key === "raise") return bar.yourTurn ? { kind: "openPanel" } : { kind: "ignore" };
  if (bar.yourTurn) {
    if (key === "fold" && bar.fold.needsConfirmation && !opts.skipFoldConfirm) return { kind: "confirmFold" };
    return { kind: "send", action: key };
  }
  return btn.highlighted ? { kind: "clearIntent" } : { kind: "queue", intent: kind };
}

export function timeBankLabel(tb: ActionBarVM["timeBank"]): string {
  return tb.activated ? "Extra Time Activated" : `Activate Extra Time (${tb.secondsLeft}s)`;
}
