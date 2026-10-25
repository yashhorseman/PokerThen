import { useEffect, useState } from 'react';
import type { RpcErrorBody } from '../../shared/protocol';
import { serverNow } from '../state/store';

/** Normalise whatever `rpc()` rejected with into an RpcErrorBody. */
export function asRpcError(e: unknown): RpcErrorBody {
  if (e && typeof e === 'object' && 'status' in e) return e as RpcErrorBody;
  return { status: 0, message: e instanceof Error ? e.message : String(e) };
}

/** digits only (the reference strips non-digits in every numeric field) */
export const digits = (s: string, max = 9) => s.replace(/\D+/g, '').slice(0, max);

/** "" -> null, otherwise integer */
export function toIntOrNull(s: string): number | null {
  const d = digits(s);
  return d === '' ? null : parseInt(d, 10);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
/** 24h HH:MM in local time (research/04 §7.1) */
export function hhmm(ms: number): string { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

/** re-render every `ms` (used for countdown texts); returns server-synchronised now */
export function useNow(ms = 1000): number {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
  return serverNow();
}

/** thousands-free number text as in the reference ("4000") */
export const fmtNum = (n: number) => String(n);

export function lsGet<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) as T; } catch { /* storage unavailable */ }
  return fallback;
}
export function lsSet(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

/** Brand */
export const BRAND = 'PokerThen';

/** Names in log lines look like `"Name @ id"` -> split into text / name tokens */
export const NAME_RE = /"(.+?) @ ([A-Za-z0-9_-]{10})"/g;
