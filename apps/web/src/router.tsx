import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "newGame" }
  | { name: "table"; gameId: string }
  | { name: "verify" }
  | { name: "tutorial" };

export function matchRoute(path: string): Route | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "/home") return { name: "home" };
  if (p === "/start-game") return { name: "newGame" };
  if (p === "/verify") return { name: "verify" };
  if (p === "/poker-tutorial") return { name: "tutorial" };
  const m = /^\/games\/([A-Za-z0-9_-]+)$/.exec(p);
  if (m) return { name: "table", gameId: m[1]! };
  return null;
}

const subs = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  subs.forEach((s) => s());
};
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

/** history API navigation (no library). */
export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState("", "", path);
  else history.pushState("", "", path);
  notify();
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
const snapshot = () => (typeof location === "undefined" ? "/" : location.pathname);

export function usePath(): string {
  return useSyncExternalStore(subscribe, snapshot, () => "/");
}
export function useRoute(): Route {
  const path = usePath();
  void version;
  return matchRoute(path) ?? { name: "home" };
}
export function useNavigate() {
  return navigate;
}
