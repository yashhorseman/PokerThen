import { useCallback, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useHotkey } from "../hotkeys";

export type Button1Color = "green" | "red" | "gray" | "yellow" | "blue" | "dark-gray";

export interface Button1Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  color?: Button1Color;
  highlighted?: boolean;
  /** ignore clicks within this many ms of the previous accepted click */
  throttleMs?: number;
  /** registers this key to click the button and shows it as a badge */
  hotkey?: string;
  /** badge text (defaults to hotkey) */
  badge?: string;
  children?: ReactNode;
}

/** `.button-1` (SPEC 6.1): colour, highlighted, disabled opacity .25, optional hotkey badge. */
export function Button1({ color, highlighted, throttleMs, hotkey, badge, className, onClick, disabled, children, type, ...rest }: Button1Props) {
  const last = useRef(0);
  const handle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (throttleMs) {
        const t = Date.now();
        if (t - last.current < throttleMs) return;
        last.current = t;
      }
      onClick?.(e);
    },
    [disabled, throttleMs, onClick]
  );
  const ref = useRef<HTMLButtonElement>(null);
  useHotkey(hotkey ?? "", () => (ref.current && !disabled ? (ref.current.click(), true) : false), { enabled: !!hotkey && !disabled });
  const cls = ["button-1", color, highlighted ? "highlighted" : "", disabled ? "disabled" : "", className].filter(Boolean).join(" ");
  const b = badge ?? hotkey;
  return (
    <button ref={ref} type={type ?? "button"} className={cls} disabled={disabled} onClick={handle} {...(b ? { "data-badge": b } : {})} {...rest}>
      {children}
      {b ? <span className="pt-hotkey-badge">{b}</span> : null}
    </button>
  );
}
