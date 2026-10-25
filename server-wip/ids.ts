import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'; // 64 chars -> no modulo bias with a 6-bit mask

/** cryptographically random URL-safe id of `len` chars */
export function randomId(len: number): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i]! & 63];
  return s;
}
export const newGameId = () => 'pgl' + randomId(21);
export const GAME_ID_RE = /^pgl[A-Za-z0-9_-]{21}$/;
