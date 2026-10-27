/** Hand names: log form (SPEC 12.2) and seat-chip form. Forms not observed live are placeholders (U-D8). */
import { type CardCode } from "@pokerthen/shared";
import { CAT, category, nibbles, scoreCodes } from "./evaluate.js";

const rankText = (r: number): string => (r <= 9 ? String(r) : r === 10 ? "10" : ({ 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[r]!);
const chipRank = rankText;

/** `Pair, A's`, `Two Pair, 5's & 2's`, `Straight, 9 High`, `Flush, J High` (observed); the rest follow the pattern (U-D8). */
export function logName(cards: readonly CardCode[]): string {
  const sc = scoreCodes(cards); const c = category(sc); const n = nibbles(sc);
  switch (c) {
    case CAT.PAIR: return `Pair, ${rankText(n[0]!)}'s`;
    case CAT.TWO_PAIR: return `Two Pair, ${rankText(n[0]!)}'s & ${rankText(n[1]!)}'s`;
    case CAT.TRIPS: return `Three of a Kind, ${rankText(n[0]!)}'s`; // U-D8
    case CAT.STRAIGHT: return `Straight, ${rankText(n[0]!)} High`;
    case CAT.FLUSH: return `Flush, ${rankText(n[0]!)} High`;
    case CAT.FULL_HOUSE: return `Full House, ${rankText(n[0]!)}'s over ${rankText(n[1]!)}'s`; // U-D8
    case CAT.QUADS: return `Four of a Kind, ${rankText(n[0]!)}'s`; // U-D8
    case CAT.STRAIGHT_FLUSH: return n[0] === 14 ? "Royal Flush" : `Straight Flush, ${rankText(n[0]!)} High`; // U-D8
    default: return `High Card, ${rankText(n[0]!)}`; // U-D8
  }
}

/** Seat chip text (client uppercases): `pair (6)`, `two pair (7,4)`, `straight`, ... */
export function chipName(cards: readonly CardCode[]): string {
  const sc = scoreCodes(cards); const c = category(sc); const n = nibbles(sc);
  switch (c) {
    case CAT.PAIR: return `pair (${chipRank(n[0]!)})`;
    case CAT.TWO_PAIR: return `two pair (${chipRank(n[0]!)},${chipRank(n[1]!)})`;
    case CAT.TRIPS: return "three of a kind"; // U-D8
    case CAT.STRAIGHT: return "straight";
    case CAT.FLUSH: return "flush";
    case CAT.FULL_HOUSE: return "full house"; // U-D8
    case CAT.QUADS: return "four of a kind"; // U-D8
    case CAT.STRAIGHT_FLUSH: return n[0] === 14 ? "royal flush" : "straight flush"; // U-D8
    default: return "high card";
  }
}
