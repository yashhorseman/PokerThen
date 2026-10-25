import { useCallback, useEffect, useState } from 'react';

export interface Prefs {
  deck: 'two' | 'four';
  amounts: 'chips' | 'bb';
  volume: 0 | 15 | 45 | 100;
  chatBeep: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  felt: 'green' | 'purple' | 'blue' | 'burgundy';
  /** desktop seat layout: fixed numbering (same for everyone) or rotate so you sit at the bottom */
  rotate: 'fixed' | 'hero';
  /** single-key action shortcuts (I check/fold, C call, K check, R raise, F fold, T time bank) — on by default on desktop, off on touch devices */
  shortcuts: boolean;
}
/** Desktop players (mouse/trackpad) get the keyboard shortcuts on by default; touch devices don't. */
const hasFinePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
const DEFAULTS: Prefs = { deck: 'two', amounts: 'chips', volume: 45, chatBeep: true, reducedMotion: 'system', felt: 'green', rotate: 'fixed', shortcuts: hasFinePointer };
const KEY = 'pt_prefs';

function load(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; }
}

let current = load();
const listeners = new Set<() => void>();

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
export const getPrefs = () => current;

export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [p, setP] = useState(current);
  useEffect(() => {
    const l = () => setP(current);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return [p, useCallback((patch: Partial<Prefs>) => setPrefs(patch), [])];
}

export function prefersReducedMotion(p: Prefs): boolean {
  if (p.reducedMotion === 'on') return true;
  if (p.reducedMotion === 'off') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
