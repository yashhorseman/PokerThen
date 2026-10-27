import { useSyncExternalStore } from "react";
import type { Orientation } from "@pokerthen/shared";
import { isMobileUA } from "../util";

/** SPEC 3: mobile UA -> screen.orientation (fallback window.orientation); desktop -> matchMedia(orientation: portrait). */
export function computeOrientation(): Orientation {
  if (typeof window === "undefined") return "landscape";
  if (isMobileUA()) {
    const so = typeof screen !== "undefined" ? screen.orientation : undefined;
    if (so && typeof so.type === "string") return so.type.startsWith("portrait") ? "portrait" : "landscape";
    const wo = (window as unknown as { orientation?: number }).orientation;
    if (typeof wo === "number") return Math.abs(wo) === 90 ? "landscape" : "portrait";
    return window.innerHeight > window.innerWidth ? "portrait" : "landscape";
  }
  return window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
}

let current: Orientation | null = null;
const subs = new Set<() => void>();
function refresh(): void {
  const o = computeOrientation();
  if (o !== current) {
    current = o;
    subs.forEach((s) => s());
  }
}
let listening = false;
function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("resize", refresh, true);
  window.addEventListener("orientationchange", refresh, true);
  try {
    screen.orientation?.addEventListener?.("change", refresh);
  } catch {
    /* ignore */
  }
}

export const orientationStore = {
  get(): Orientation {
    if (current === null) current = computeOrientation();
    return current;
  },
  refresh,
  subscribe(fn: () => void): () => void {
    ensureListening();
    subs.add(fn);
    return () => subs.delete(fn);
  }
};

export function useOrientationValue(): Orientation {
  return useSyncExternalStore(orientationStore.subscribe, orientationStore.get, () => "landscape" as Orientation);
}
