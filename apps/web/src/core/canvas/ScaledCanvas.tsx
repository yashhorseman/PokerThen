import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { isMobileUA } from "../util";
import { orientationStore, useOrientationValue } from "./orientation";

/** root font-size = 0.032 x canvas height; zoom = 16 / min(rootFont, 26) (SPEC 3) */
export function applyScale(canvasHeight: number, root: HTMLElement = document.documentElement): number {
  const fs = 0.032 * canvasHeight;
  root.style.fontSize = `${fs}px`;
  root.style.setProperty("--table-design-system-zoom", String(16 / Math.min(fs, 26)));
  return fs;
}

const EDITABLE = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true);
};

export interface ScaledCanvasProps {
  children?: ReactNode;
  className?: string;
}

/**
 * `#main-container > #canvas` (SPEC 3). Sets `html.landscape|portrait`, observes the canvas and recomputes the rem;
 * freezes the rem while an input is focused on mobile (iOS keyboard); recomputes after orientation changes.
 */
export function ScaledCanvas({ children, className }: ScaledCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const orientation = useOrientationValue();
  const frozen = useRef(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("landscape", "portrait");
    root.classList.add(orientation);
    // recompute AFTER the class changed (the reference had a stale-rem quirk)
    const el = ref.current;
    if (el && !frozen.current) {
      const r = requestAnimationFrame(() => applyScale(el.getBoundingClientRect().height));
      applyScale(el.getBoundingClientRect().height);
      return () => cancelAnimationFrame(r);
    }
    return undefined;
  }, [orientation]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const recompute = () => {
      if (!frozen.current) applyScale(el.getBoundingClientRect().height);
    };
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    const mobile = isMobileUA();
    const vv = window.visualViewport;
    const onIn = (e: FocusEvent) => {
      if (!mobile || !EDITABLE(e.target)) return;
      frozen.current = true;
      const h = document.documentElement.getBoundingClientRect().height;
      document.documentElement.style.height = `${h}px`;
      const t = e.target as HTMLElement;
      setTimeout(() => {
        if (!vv) return;
        const bottom = t.getBoundingClientRect().bottom;
        window.scrollBy(0, bottom - (vv.offsetTop + vv.height) + 8);
      }, 300);
    };
    const onOut = (e: FocusEvent) => {
      if (!mobile || !EDITABLE(e.target)) return;
      frozen.current = false;
      document.documentElement.style.height = "";
      window.scrollTo(0, 0);
      requestAnimationFrame(recompute);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    const onOrient = () => {
      orientationStore.refresh();
      requestAnimationFrame(recompute);
    };
    window.addEventListener("orientationchange", onOrient, true);
    window.addEventListener("resize", onOrient, true);
    recompute();
    return () => {
      ro.disconnect();
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener("orientationchange", onOrient, true);
      window.removeEventListener("resize", onOrient, true);
    };
  }, []);

  return (
    <div id="main-container">
      <div id="canvas" ref={ref} className={className}>
        {children}
      </div>
    </div>
  );
}
