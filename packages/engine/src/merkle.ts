import { sha256 } from './sha256';
import type { Card } from './cards';

/**
 * Per-card Merkle commitment to the shuffled deck.
 *
 * Before any card is dealt the server publishes `root`. Each leaf binds a deck position, a card and a
 * random per-card salt. Later the server can reveal individual cards (board, shown hands, burn cards,
 * a player's own hole cards) with a proof that they sit at that position of the committed deck —
 * without revealing folded, mucked or undealt cards.
 */
export interface CardProof {
  index: number;
  card: Card;
  salt: string;
  /** sibling hashes from leaf to root; each is [hash, siblingIsRight] */
  path: Array<[string, boolean]>;
}

export const leafHash = (index: number, card: Card, salt: string) => sha256(`leaf|${index}|${card}|${salt}`);
const nodeHash = (l: string, r: string) => sha256(`node|${l}|${r}`);

export function buildTree(deck: Card[], salts: string[]): string[][] {
  let level = deck.map((c, i) => leafHash(i, c, salts[i]));
  const levels = [level];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(nodeHash(level[i], level[i + 1] ?? level[i]));
    levels.push(next);
    level = next;
  }
  return levels;
}

export const merkleRoot = (deck: Card[], salts: string[]): string => {
  const t = buildTree(deck, salts);
  return t[t.length - 1][0];
};

export function proofFor(levels: string[][], deck: Card[], salts: string[], index: number): CardProof {
  const path: Array<[string, boolean]> = [];
  let idx = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l];
    const isRight = idx % 2 === 1;
    const sib = isRight ? level[idx - 1] : level[idx + 1] ?? level[idx];
    path.push([sib, !isRight]);
    idx = Math.floor(idx / 2);
  }
  return { index, card: deck[index], salt: salts[index], path };
}

export function verifyProof(root: string, p: CardProof): boolean {
  let h = leafHash(p.index, p.card, p.salt);
  for (const [sib, sibIsRight] of p.path) h = sibIsRight ? nodeHash(h, sib) : nodeHash(sib, h);
  return h === root;
}
