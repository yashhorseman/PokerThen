import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type Placement = "right" | "left" | "top" | "bottom";
export interface PopoverProps {
  anchor: HTMLElement | null;
  placement?: Placement;
  onClose: () => void;
  className?: string;
  children?: ReactNode;
}

/**
 * White `popover-1` card with an arrow, rendered inside `#canvas` (so rem sizes scale) and positioned next to the
 * anchor. Outside clicks and Esc close it (SPEC 2.3, 9.1).
 */
export function Popover({ anchor, placement = "right", onClose, className, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const host = typeof document === "undefined" ? null : (document.getElementById("canvas") ?? document.body);

  useLayoutEffect(() => {
    if (!anchor || !host || !ref.current) return;
    const h = host.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const p = ref.current.getBoundingClientRect();
    const gap = 8;
    let left = a.left - h.left;
    let top = a.top - h.top;
    if (placement === "right") (left = a.right - h.left + gap), (top = a.top - h.top + a.height / 2 - p.height / 2);
    if (placement === "left") (left = a.left - h.left - p.width - gap), (top = a.top - h.top + a.height / 2 - p.height / 2);
    if (placement === "top") (left = a.left - h.left + a.width / 2 - p.width / 2), (top = a.top - h.top - p.height - gap);
    if (placement === "bottom") (left = a.left - h.left + a.width / 2 - p.width / 2), (top = a.bottom - h.top + gap);
    setPos({ left, top });
  }, [anchor, placement, host, children]);

  useEffect(() => {
    const down = (e: Event) => {
      const t = e.target as Node | null;
      if (ref.current && t && !ref.current.contains(t) && !(anchor && anchor.contains(t))) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down, true);
    document.addEventListener("touchstart", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("touchstart", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  if (!host) return null;
  return createPortal(
    <div
      ref={ref}
      className={`popover-1 pt-popover-${placement} ${className ?? ""}`}
      style={{ position: "absolute", left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      <span className="pt-popover-arrow" />
      {children}
    </div>,
    host
  );
}
