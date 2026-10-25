import { useSyncExternalStore } from 'react';

/** Tiny pathname router (no library). `navigate` uses the History API and notifies subscribers. */
const EVT = 'pt:navigate';

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', to); else history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVT));
}

function subscribe(cb: () => void) {
  window.addEventListener('popstate', cb);
  window.addEventListener(EVT, cb);
  return () => { window.removeEventListener('popstate', cb); window.removeEventListener(EVT, cb); };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname, () => '/');
}

export type Route =
  | { name: 'landing' }
  | { name: 'home' }
  | { name: 'start' }
  | { name: 'game'; id: string }
  | { name: 'devtable' }
  | { name: 'legal'; kind: 'terms' | 'privacy' };

export function matchRoute(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/') return { name: 'landing' };
  if (p === '/home') return { name: 'home' };
  if (p === '/start-game') return { name: 'start' };
  if (p === '/__dev/table') return { name: 'devtable' };
  if (p === '/terms') return { name: 'legal', kind: 'terms' };
  if (p === '/privacy') return { name: 'legal', kind: 'privacy' };
  const m = /^\/games\/([A-Za-z0-9_-]+)$/.exec(p);
  if (m) return { name: 'game', id: m[1]! };
  return { name: 'landing' }; // unknown path -> landing (same as the reference's 302 /)
}
