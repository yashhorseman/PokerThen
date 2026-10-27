import { useEffect, useState } from "react";

/** Re-render every `ms` while `active` (timer bar 100 ms redraw, countdown text 80 ms). */
export function useTick(ms: number, active = true): void {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((n) => (n + 1) | 0), ms);
    return () => clearInterval(t);
  }, [ms, active]);
}
