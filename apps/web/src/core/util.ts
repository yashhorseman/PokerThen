/** Small pure helpers shared across core/. */

export const MOBILE_UA_RE = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isMobileUA(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return MOBILE_UA_RE.test(ua);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Structural sharing: returns `prev` (same reference) for every subtree of `next` that is deeply equal to the
 * corresponding subtree of `prev`. Functions are compared by reference. Used so unchanged seats / slices of the
 * view model keep their identity and React does not re-render them (ARCH 10.1).
 */
export function shareStructure<T>(prev: unknown, next: T): T {
  if (prev === (next as unknown)) return next;
  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return next;
    let same = prev.length === next.length;
    const out = next.map((n, i) => {
      const s = shareStructure(prev[i], n);
      if (s !== prev[i]) same = false;
      return s;
    });
    return (same ? prev : out) as T;
  }
  if (isObj(next)) {
    if (!isObj(prev)) return next;
    const nk = Object.keys(next);
    let same = Object.keys(prev).length === nk.length;
    const out: Record<string, unknown> = {};
    for (const k of nk) {
      const s = shareStructure(prev[k], next[k]);
      out[k] = s;
      if (s !== prev[k] || !(k in prev)) same = false;
    }
    return (same ? prev : out) as T;
  }
  return next;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/** localStorage wrappers: every access in try/catch (SPEC 1.4). */
export function lsGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
export function lsRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function formatMMSS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
