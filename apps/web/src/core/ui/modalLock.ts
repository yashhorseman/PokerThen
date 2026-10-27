import { useEffect } from "react";

let locks = 0;
const subs = new Set<() => void>();
export const modalLock = {
  count: () => locks,
  subscribe(fn: () => void): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  acquire(): () => void {
    locks++;
    subs.forEach((s) => s());
    let done = false;
    return () => {
      if (done) return;
      done = true;
      locks = Math.max(0, locks - 1);
      subs.forEach((s) => s());
    };
  }
};

/** While mounted (and `active`), global hotkeys are disabled (SPEC 6.4). */
export function useModalLock(active = true): void {
  useEffect(() => (active ? modalLock.acquire() : undefined), [active]);
}
