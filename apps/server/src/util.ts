import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { newDeck, type Card } from '@pokerthen/engine';

/** Unbiased Fisher–Yates using node's CSPRNG (crypto.randomInt rejects out-of-range draws, so no modulo bias). */
export function secureShuffle(deck: Card[] = newDeck()): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function freshDeck(): { deck: Card[]; salts: string[] } {
  return { deck: secureShuffle(), salts: Array.from({ length: 52 }, () => randomBytes(12).toString('hex')) };
}

export const randomId = (bytes = 16) => randomBytes(bytes).toString('base64url');
export const randomFloat = () => randomInt(0, 1_000_000) / 1_000_000;

/* ───────────── signed guest-session cookie ───────────── */

export function signIdentity(identityId: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(identityId).digest('base64url');
  return `${identityId}.${mac}`;
}

export function verifyIdentity(cookie: string | undefined, secret: string): string | null {
  if (!cookie) return null;
  const i = cookie.lastIndexOf('.');
  if (i < 1) return null;
  const id = cookie.slice(0, i);
  const mac = Buffer.from(cookie.slice(i + 1));
  const expect = Buffer.from(createHmac('sha256', secret).update(id).digest('base64url'));
  if (mac.length !== expect.length || !timingSafeEqual(mac, expect)) return null;
  return /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : null;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* ───────────── AES-256-GCM sealing for deck material at rest ───────────── */

export function deriveKey(secret: string): Buffer {
  return createHash('sha256').update('pokerthen-deck-key|' + secret).digest();
}

export function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function unseal(blob: string, key: Buffer): string {
  const b = Buffer.from(blob, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

/** Spreadsheet formula-injection guard for CSV cells. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
