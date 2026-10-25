import type { CardCode } from './protocol';

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function rankOf(c: CardCode): string { return c[0]!; }
export function suitOf(c: CardCode): string { return c[1]!; }
/** "Ts" -> "10", others unchanged */
export function rankLabel(c: CardCode): string { return c[0] === 'T' ? '10' : c[0]!; }
/** log format: "10♠", "A♥" */
export function cardLabel(c: CardCode): string { return rankLabel(c) + SUIT_GLYPH[suitOf(c)]; }
export function isRedSuit(c: CardCode): boolean { return suitOf(c) === 'h' || suitOf(c) === 'd'; }
export function fullDeck(): CardCode[] {
  const d: CardCode[] = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}
