/**
 * Entropy-injected RNG (SPEC 20.2). NO Math.random, NO node:crypto here: every random bit comes from `entropy(bytes)`.
 * uniformInt uses rejection sampling on 32-bit draws; shuffle is Fisher-Yates from i=51 down to 1.
 */
import { CANONICAL_DECK, type CardCode, type Entropy } from "@pokerthen/shared";

/** One unsigned 32-bit big-endian draw. */
export function uint32(entropy: Entropy): number {
  const b = entropy(4);
  if (b.length < 4) throw new Error("entropy returned fewer than 4 bytes");
  return ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
}

/**
 * Uniform integer in [0, n) without modulo bias: draw u; reject while u >= limit = floor(2^32/n)*n; return u % n.
 * n === 1 consumes no entropy. n must be an integer in [1, 2^32].
 */
export function uniformInt(entropy: Entropy, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new RangeError(`uniformInt: bad n ${n}`);
  if (n === 1) return 0;
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) {
    const u = uint32(entropy);
    if (u < limit) return u % n;
  }
}

/** Fisher-Yates over the canonical deck (i from 51 to 1, j uniform in [0,i]). */
export function shuffle(entropy: Entropy, deck: readonly CardCode[] = CANONICAL_DECK): CardCode[] {
  const a = [...deck];
  for (let i = a.length - 1; i >= 1; i--) {
    const j = uniformInt(entropy, i + 1);
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

/** Generic in-place-free shuffle of any array (used for Shuffle Seats). */
export function shuffleArray<T>(entropy: Entropy, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i >= 1; i--) {
    const j = uniformInt(entropy, i + 1);
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

/** 32 random bytes as 64 lowercase hex chars (independent draw from the shuffle). */
export function newSalt(entropy: Entropy): string {
  const b = entropy(32);
  if (b.length < 32) throw new Error("entropy returned fewer than 32 bytes");
  let s = "";
  for (let i = 0; i < 32; i++) s += b[i]!.toString(16).padStart(2, "0");
  return s;
}

/** 12 lowercase letters (hand id look-alike, e.g. "jxmorahjxvqp"), drawn with uniformInt. */
export function newHandId(entropy: Entropy, length = 12): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(97 + uniformInt(entropy, 26));
  return s;
}

/** Tiny deterministic generator for Monte-Carlo equity, seeded from entropy (xorshift128+ like, 32-bit lanes). */
export function seededStream(entropy: Entropy): () => number {
  let a = uint32(entropy) || 0x9e3779b9;
  let b = uint32(entropy) || 0x85ebca6b;
  let c = uint32(entropy) || 0xc2b2ae35;
  let d = uint32(entropy) || 0x27d4eb2f;
  return () => {
    // xoshiro128**
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
    return r;
  };
}
const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;
