import { CANONICAL_DECK, isCardCode, type CardCode } from "./cards.js";
import type { FairnessReveal, FairnessUsage, RevealedCard } from "./http.js";

/**
 * Per-card Merkle fairness (docs/FAIRNESS-MERKLE.md, supersedes SPEC 20.2-20.4).
 * All hashes SHA-256 lowercase hex over UTF-8 strings joined with "|".
 */
export const COMMIT_TAG = "PT1";
export const MERKLE_LEAVES = 64;
export const MERKLE_DEPTH = 6;
export const GENESIS_PREV_COMMITMENT = "0".repeat(64);

export interface CommitInput {
  gameId: string;
  handNumber: number;
  handId: string;
  /** previous hand's commitment of the same table; GENESIS_PREV_COMMITMENT (64 zeros) for the first hand */
  prevCommitment: string;
  /** Merkle root over the 52 leaves */
  root: string;
}

// ---- synchronous pure SHA-256 (identical in browser and Node; engine may use node:crypto instead) ----
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Synchronous SHA-256 of a UTF-8 string, lowercase hex. */
export function sha256HexSync(text: string): string {
  const msg = new TextEncoder().encode(text);
  const len = msg.length;
  const total = (((len + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor((len * 8) / 0x100000000));
  dv.setUint32(total - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[] as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** SHA-256 as lowercase hex via WebCrypto (browser and Node 22 expose globalThis.crypto.subtle). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- construction ----
/** salt[i] = SHA256("PT1S|" + masterSalt + "|" + i) */
export function cardSalt(masterSalt: string, index: number): string {
  return sha256HexSync(`${COMMIT_TAG}S|${masterSalt}|${index}`);
}
export function leafPreimage(gameId: string, handNumber: number, handId: string, index: number, card: string, salt: string): string {
  return `${COMMIT_TAG}L|${gameId}|${handNumber}|${handId}|${index}|${card}|${salt}`;
}
export function computeLeaf(gameId: string, handNumber: number, handId: string, index: number, card: string, salt: string): string {
  return sha256HexSync(leafPreimage(gameId, handNumber, handId, index, card, salt));
}
export const PAD_LEAF = sha256HexSync(`${COMMIT_TAG}PAD`);
export function merkleNode(left: string, right: string): string {
  return sha256HexSync(`${COMMIT_TAG}N|${left}|${right}`);
}

export interface MerkleTree {
  /** levels[0] = 64 leaves ... levels[6] = [root] */
  levels: string[][];
  root: string;
}
export function buildMerkle(leaves52: readonly string[]): MerkleTree {
  if (leaves52.length !== 52) throw new Error("Merkle tree needs 52 leaves");
  let level = [...leaves52, ...Array<string>(MERKLE_LEAVES - 52).fill(PAD_LEAF)];
  const levels = [level];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(merkleNode(level[i]!, level[i + 1]!));
    levels.push(next);
    level = next;
  }
  return { levels, root: level[0]! };
}
/** Sibling hashes bottom-up for leaf `index`. */
export function merkleProof(tree: MerkleTree, index: number): string[] {
  const proof: string[] = [];
  let ix = index;
  for (let l = 0; l < MERKLE_DEPTH; l++) { proof.push(tree.levels[l]![ix ^ 1]!); ix >>= 1; }
  return proof;
}
export function foldProof(leaf: string, index: number, proof: readonly string[]): string {
  let h = leaf; let ix = index;
  for (const sib of proof) { h = (ix & 1) === 0 ? merkleNode(h, sib) : merkleNode(sib, h); ix >>= 1; }
  return h;
}

export interface DeckCommitment {
  tree: MerkleTree;
  root: string;
  commitment: string;
}
/** Full commitment for a deck (engine side). */
export function commitDeck(i: { gameId: string; handNumber: number; handId: string; prevCommitment: string; deck: readonly CardCode[]; masterSalt: string }): DeckCommitment {
  const leaves = i.deck.map((c, ix) => computeLeaf(i.gameId, i.handNumber, i.handId, ix, c, cardSalt(i.masterSalt, ix)));
  const tree = buildMerkle(leaves);
  return { tree, root: tree.root, commitment: computeCommitmentSync({ gameId: i.gameId, handNumber: i.handNumber, handId: i.handId, prevCommitment: i.prevCommitment, root: tree.root }) };
}
/** Reveal entry for one exposed deck index. */
export function revealCard(c: DeckCommitment, deck: readonly CardCode[], masterSalt: string, index: number): RevealedCard {
  return { index, card: deck[index]!, salt: cardSalt(masterSalt, index), proof: merkleProof(c.tree, index) };
}

/** The exact UTF-8 string that is hashed: PT1C|gameId|handNumber|handId|prevCommitment|root */
export function commitmentPreimage(i: CommitInput): string {
  return [`${COMMIT_TAG}C`, i.gameId, String(i.handNumber), i.handId, i.prevCommitment, i.root].join("|");
}
export function computeCommitmentSync(i: CommitInput): string {
  return sha256HexSync(commitmentPreimage(i));
}
/** Async (WebCrypto) commitment; must equal computeCommitmentSync (tested). */
export async function computeCommitment(i: CommitInput): Promise<string> {
  return sha256Hex(commitmentPreimage(i));
}

// ---- verification ----
export interface VerifyCheck { id: string; ok: boolean; detail: string }

export function isPermutationOfDeck(deck: readonly string[]): boolean {
  if (deck.length !== 52 || !deck.every(isCardCode)) return false;
  return new Set(deck).size === 52 && CANONICAL_DECK.every((c) => deck.includes(c));
}

/** Resolve usage entries to the cards that were revealed (undefined for indices never exposed; NEVER guessable). */
export function resolveUsage(revealed: readonly RevealedCard[], usage: readonly FairnessUsage[]) {
  const by = new Map(revealed.map((r) => [r.index, r.card] as const));
  return usage.map((u) => ({ ...u, cards: u.indices.map((ix) => by.get(ix)) as (CardCode | undefined)[] }));
}

/** Structural check of the deal mapping (SPEC 20.3): indices unique, in range, consumed in increasing order, holes first in dealOrder order. */
export function checkUsage(rev: FairnessReveal): VerifyCheck {
  const seen = new Set<number>();
  let last = -1;
  for (const u of rev.usage) for (const ix of u.indices) {
    if (!Number.isInteger(ix) || ix < 0 || ix > 51 || seen.has(ix) || ix < last) {
      return { id: "usage", ok: false, detail: `Deck index ${ix} is invalid, repeated or out of order.` };
    }
    seen.add(ix); last = ix;
  }
  const holes = rev.usage.filter((u) => u.kind === "hole");
  const n = rev.dealOrder.length;
  const first = holes.slice(0, n).map((h) => h.playerId);
  if (n > 0 && JSON.stringify(first) !== JSON.stringify(rev.dealOrder)) {
    return { id: "usage", ok: false, detail: "First round of hole cards does not follow the deal order." };
  }
  return { id: "usage", ok: true, detail: `${seen.size} deck positions consumed in order.` };
}

/**
 * Checks: (cards) well-formed and no index revealed twice with different values, (usage) deal mapping, (proofs) every revealed
 * leaf folds to the root, (hash) commitment recomputed from prevCommitment+root equals the published one, (chain) optional.
 * Log comparison and timing need the log; the /verify page adds them.
 */
export async function verifyReveal(rev: FairnessReveal, expected?: { commitment?: string; prevCommitment?: string | null }): Promise<VerifyCheck[]> {
  const checks: VerifyCheck[] = [];
  const byIndex = new Map<number, string>();
  let wellFormed = true; let dup = false;
  for (const r of rev.cards) {
    if (!Number.isInteger(r.index) || r.index < 0 || r.index > 51 || !isCardCode(r.card) || r.proof.length !== MERKLE_DEPTH) wellFormed = false;
    const prior = byIndex.get(r.index);
    if (prior !== undefined && prior !== r.card) dup = true;
    byIndex.set(r.index, r.card);
  }
  checks.push({ id: "cards", ok: wellFormed && !dup, detail: dup ? "A deck index is revealed twice with different values." : wellFormed ? `${rev.cards.length} revealed cards are well-formed.` : "A revealed card is malformed." });
  let proofsOk = wellFormed;
  if (wellFormed) for (const r of rev.cards) {
    const leaf = computeLeaf(rev.gameId, rev.handNumber, rev.handId, r.index, r.card, r.salt);
    if (foldProof(leaf, r.index, r.proof) !== rev.root) { proofsOk = false; break; }
  }
  checks.push({ id: "proofs", ok: proofsOk, detail: "Every revealed card's Merkle proof leads to the committed root." });
  const hash = await computeCommitment({ gameId: rev.gameId, handNumber: rev.handNumber, handId: rev.handId, prevCommitment: rev.prevCommitment, root: rev.root });
  const want = expected?.commitment ?? rev.commitment;
  checks.push({ id: "hash", ok: hash === want, detail: `SHA-256 of preimage = ${hash}; published commitment = ${want}.` });
  if (expected && "prevCommitment" in expected) {
    checks.push({ id: "chain", ok: (expected.prevCommitment ?? GENESIS_PREV_COMMITMENT) === rev.prevCommitment, detail: "prevCommitment equals the previous hand's commitment." });
  }
  checks.push(checkUsage(rev));
  return checks;
}
