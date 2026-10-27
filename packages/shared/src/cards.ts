/** Card codes follow the reference frames: rank char + suit char, e.g. "Ts", "Ah", "2c". T = ten. */
export const SUITS = ["s", "h", "d", "c"] as const;
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type CardCode = `${Rank}${Suit}`;

/** Canonical unshuffled deck (SPEC 20.2): suits s,h,d,c; ranks ascending within each suit. */
export const CANONICAL_DECK: readonly CardCode[] = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}` as CardCode));

export const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function isCardCode(x: unknown): x is CardCode {
  return typeof x === "string" && x.length === 2 && (RANKS as readonly string[]).includes(x[0]!) && (SUITS as readonly string[]).includes(x[1]!);
}

/** "Ts" -> "10" + glyph, used by log lines and UI text: rank then suit glyph, ten shown as 10. */
export function cardText(code: CardCode): string {
  const rank = code[0] === "T" ? "10" : code[0]!;
  return rank + SUIT_GLYPH[code[1] as Suit];
}

export function rankValue(r: Rank): number {
  return RANKS.indexOf(r) + 2;
}

/** A hole-card slot as sent to a client. value=null means "exists but hidden from you". {} entries are sent as null slots array = []. */
export interface CardSlot {
  value: CardCode | null;
  showing: boolean;
}
