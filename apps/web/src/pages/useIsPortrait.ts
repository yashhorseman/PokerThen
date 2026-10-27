import { useEffect, useState } from "react";

/** Mirrors the `portrait` class W4 puts on <html> (SPEC 3). */
export function useIsPortrait(): boolean {
  const read = () => typeof document !== "undefined" && document.documentElement.classList.contains("portrait");
  const [p, setP] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setP(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setP(read());
    return () => mo.disconnect();
  }, []);
  return p;
}
