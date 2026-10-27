/** Per-card Merkle commitment (docs/FAIRNESS-MERKLE.md) using the synchronous node:crypto hash; byte-identical to shared (tested). */
import { COMMIT_TAG, MERKLE_DEPTH, MERKLE_LEAVES, commitmentPreimage, leafPreimage, type CardCode, type FairnessUsage, type RevealedCard, type FairnessReveal } from "@pokerthen/shared";
import { sha256Hex } from "./hash.js";

export const PAD_LEAF = sha256Hex(`${COMMIT_TAG}PAD`);
export const cardSalt = (masterSalt: string, i: number): string => sha256Hex(`${COMMIT_TAG}S|${masterSalt}|${i}`);
const node = (l: string, r: string): string => sha256Hex(`${COMMIT_TAG}N|${l}|${r}`);

export interface Commit { levels: string[][]; root: string; commitment: string }

export function commitDeck(i: { gameId: string; handNumber: number; handId: string; prevCommitment: string; deck: readonly CardCode[]; masterSalt: string }): Commit {
  let level = i.deck.map((c, ix) => sha256Hex(leafPreimage(i.gameId, i.handNumber, i.handId, ix, c, cardSalt(i.masterSalt, ix))));
  level = [...level, ...Array<string>(MERKLE_LEAVES - level.length).fill(PAD_LEAF)];
  const levels = [level];
  while (level.length > 1) {
    const next: string[] = [];
    for (let k = 0; k < level.length; k += 2) next.push(node(level[k]!, level[k + 1]!));
    levels.push(next); level = next;
  }
  const root = level[0]!;
  return { levels, root, commitment: sha256Hex(commitmentPreimage({ gameId: i.gameId, handNumber: i.handNumber, handId: i.handId, prevCommitment: i.prevCommitment, root })) };
}

export function revealCardAt(c: Commit, deck: readonly CardCode[], masterSalt: string, index: number): RevealedCard {
  const proof: string[] = []; let ix = index;
  for (let l = 0; l < MERKLE_DEPTH; l++) { proof.push(c.levels[l]![ix ^ 1]!); ix >>= 1; }
  return { index, card: deck[index]!, salt: cardSalt(masterSalt, index), proof };
}

export function buildReveal(p: { gameId: string; handNumber: number; handId: string; prevCommitment: string; deck: readonly CardCode[]; masterSalt: string; exposed: readonly number[]; dealOrder: string[]; usage: FairnessUsage[]; at: number }): FairnessReveal {
  const c = commitDeck(p);
  const idx = [...new Set(p.exposed)].sort((a, b) => a - b);
  return { gameId: p.gameId, handNumber: p.handNumber, handId: p.handId, commitment: c.commitment, prevCommitment: p.prevCommitment, root: c.root, dealOrder: p.dealOrder, usage: p.usage, cards: idx.map((i) => revealCardAt(c, p.deck, p.masterSalt, i)), revealedAtMs: p.at };
}
