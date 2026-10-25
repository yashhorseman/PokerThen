import type { Prefs } from './prefs';

export const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const rankLabel = (c: string) => (c[0] === 'T' ? '10' : c[0]);
export const cardText = (c: string) => `${rankLabel(c)}${SUIT[c[1]]}`;
const SUIT_NAME: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_NAME: Record<string, string> = { A: 'ace', K: 'king', Q: 'queen', J: 'jack', T: 'ten' };
export const cardAria = (c: string) => `${RANK_NAME[c[0]] ?? c[0]} of ${SUIT_NAME[c[1]]}`;

export function fmtAmount(n: number, prefs: Prefs, bb: number): string {
  if (prefs.amounts === 'bb' && bb > 0) {
    const v = n / bb;
    return `${Number.isInteger(v) ? v : v.toFixed(1)} BB`;
  }
  return n >= 100_000 ? n.toLocaleString('en-US') : String(n);
}

export const shortTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
