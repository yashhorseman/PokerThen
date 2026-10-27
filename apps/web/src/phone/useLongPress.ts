import { useCallback, useRef } from "react";
import type { PointerEvent, MouseEvent } from "react";

export interface LongPressOptions {
  /** hold time in ms (SPEC 5.6: 500) */
  ms?: number;
}

/**
 * Long-press via pointer events (SPEC 5.6). After a long press fires, the click that follows is swallowed.
 * Usage: `<button {...useLongPress(openLedger, { onClick: openLog })}>` or spread handlers onto any element.
 * Moving the pointer cancels; pointerleave/cancel/up before the timeout cancels (a normal click then passes).
 */
export function useLongPress(onLongPress: () => void, opts: LongPressOptions & { onClick?: (e: MouseEvent) => void } = {}) {
  const ms = opts.ms ?? 500;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cb = useRef(onLongPress);
  cb.current = onLongPress;
  const click = useRef(opts.onClick);
  click.current = opts.onClick;

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  return {
    onPointerDown: (e: PointerEvent) => {
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      clear();
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        cb.current();
      }, ms);
    },
    onPointerMove: (e: PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent) => {
      if (fired.current) e.preventDefault();
    },
    onClick: (e: MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      click.current?.(e);
    }
  };
}
