import { DELETE } from "./frame.js";

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Apply a delta onto a base value (SPEC 21/05 s4): plain objects merge recursively; arrays and scalars replace wholesale;
 * the sentinel "<D>" deletes the key. Returns a NEW object (base is not mutated); untouched subtrees are shared.
 */
export function applyDelta<T>(base: T, delta: Json): T {
  if (delta === DELETE) return undefined as T;
  if (!isObj(delta) || !isObj(base)) return delta as T;
  const out: Record<string, Json> = { ...base };
  for (const k of Object.keys(delta)) {
    const d = delta[k];
    if (d === DELETE) delete out[k];
    else if (isObj(d)) out[k] = applyDelta(isObj(out[k]) ? out[k] : {}, d);
    else out[k] = d;
  }
  return out as T;
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Smallest delta that turns `prev` into `next` under applyDelta semantics, or undefined when equal.
 * undefined values are treated as absent. Arrays that differ are sent whole.
 */
export function diffFrames(prev: Json, next: Json): Json | undefined {
  if (deepEqual(prev, next)) return undefined;
  if (!isObj(prev) || !isObj(next)) return next === undefined ? DELETE : next;
  const out: Record<string, Json> = {};
  for (const k of Object.keys(next)) {
    if (next[k] === undefined) {
      if (k in prev) out[k] = DELETE;
      continue;
    }
    if (!(k in prev) || prev[k] === undefined) { out[k] = next[k]; continue; }
    const d = diffFrames(prev[k], next[k]);
    if (d !== undefined) out[k] = d;
  }
  for (const k of Object.keys(prev)) if (!(k in next) && prev[k] !== undefined) out[k] = DELETE;
  return Object.keys(out).length ? out : undefined;
}
