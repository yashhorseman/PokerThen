import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { CANONICAL_DECK, type CardCode, type Entropy } from "@pokerthen/shared";

/**

 * DEV_FIXED_DECKS (honoured ONLY when NODE_ENV !== 'production'): a JSON file `[["As","Kd",...52 codes], ...]` (or {decks:[...]}).
 * The entropy source emits the 32-bit draws that make a Fisher-Yates (i=51..1, j = u % (i+1), swap) over CANONICAL_DECK produce
 * exactly the requested order. Every draw whose byte length is a multiple of 4 while a scripted deck is "open" is served from the
 * script; the draw that follows a completed deck (the salt) and everything after the last deck is real randomness.
 * Assumption to re-check against engine/src/rng.ts: big-endian words (DEV_FIXED_DECKS_LE=1 switches to little-endian).
 */
export function deckToDraws(deck: readonly CardCode[]): number[] {
  const work: CardCode[] = [...CANONICAL_DECK];
  const draws: number[] = [];
  for (let i = 51; i >= 1; i--) {
    const j = work.indexOf(deck[i]!);
    if (j < 0 || j > i) throw new Error(`deck is not a permutation of the canonical deck (card ${deck[i]})`);
    draws.push(j);
    [work[i], work[j]] = [work[j]!, work[i]!];
  }
  return draws;
}

export type FixedDeck = CardCode[] | { deck: CardCode[]; /** raw 32-bit draws consumed BEFORE the shuffle (e.g. the random first dealer: index into the participants) */ pre?: number[] };

/** Draws the engine makes AFTER the shuffle and which stay random: master salt (1 draw of 32 bytes) + hand id (12 x uint32). */
const POST_DRAWS = 13;

export function fixedDeckEntropy(decks: FixedDeck[], littleEndian = false): Entropy {
  const queue = decks.map((d) => (Array.isArray(d) ? { pre: [] as number[], draws: deckToDraws(d) } : { pre: d.pre ?? [], draws: deckToDraws(d.deck) }));
  let words: number[] | null = null;
  let postLeft = 0;
  return (n) => {
    if (!words && postLeft === 0 && queue.length) { const d = queue.shift()!; words = [...d.pre, ...d.draws]; }
    if (words && n % 4 === 0 && n / 4 <= words.length) {
      const out = Buffer.alloc(n);
      for (let k = 0; k < n / 4; k++) {
        const w = words.shift()!;
        if (littleEndian) out.writeUInt32LE(w, k * 4); else out.writeUInt32BE(w, k * 4);
      }
      if (words.length === 0) { words = null; postLeft = POST_DRAWS; }
      return new Uint8Array(out);
    }
    if (postLeft > 0 && !words) postLeft--;
    return new Uint8Array(randomBytes(n));
  };
}

export function loadFixedDecks(file: string): Entropy {
  const j = JSON.parse(readFileSync(file, "utf8")) as FixedDeck[] | { decks: FixedDeck[] };
  return fixedDeckEntropy(Array.isArray(j) ? j : j.decks, process.env.DEV_FIXED_DECKS_LE === "1");
}
