import { useEffect, useState } from "react";

/** Re-render once when `deadline` (ms on the server clock) passes. */
export function useTickAt(deadline: number | null | undefined, now: () => number): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!deadline || !Number.isFinite(deadline)) return;
    const ms = deadline - now();
    if (ms <= 0) return;
    const t = setTimeout(() => bump((n) => n + 1), ms + 5);
    return () => clearTimeout(t);
  }, [deadline, now]);
  return !!deadline && Number.isFinite(deadline) && now() >= deadline;
}

/** Local click lock (SPEC 6.1: all buttons disable for 750 ms after any click on your turn). */
export function useLock(): [locked: boolean, lock: (ms: number) => void, unlock: () => void] {
  const [until, setUntil] = useState(0);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!until) return;
    const ms = until - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => bump((n) => n + 1), ms + 5);
    return () => clearTimeout(t);
  }, [until]);
  return [Date.now() < until, (ms) => setUntil(Date.now() + ms), () => setUntil(0)];
}
