import { useCallback, useEffect, useState } from 'react';

export interface Prefs {
  deck: 'two' | 'four';
  amounts: 'chips' | 'bb';
  volume: 0 | 15 | 45 | 100;
  chatBeep: boolean;
  reducedMotion: 'system' | 'on' | 'off';
}
const DEFAULTS: Prefs = { deck: 'two', amounts: 'chips', volume: 45, chatBeep: true, reducedMotion: 'system' };
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
