import { useSyncExternalStore } from 'react';

/** Tiny external store: getState / setState(partial|fn) / subscribe / useStore(selector). */
export function createStore<S extends object>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  const getState = () => state;
  const setState = (p: Partial<S> | ((s: S) => Partial<S>)) => {
    const next = typeof p === 'function' ? p(state) : p;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  function useStore<T>(selector: (s: S) => T): T {
    return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
  }
  return { getState, setState, subscribe, useStore };
}
