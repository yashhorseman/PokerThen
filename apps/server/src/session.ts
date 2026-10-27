import { createHmac, randomBytes } from "node:crypto";

export const COOKIE_NAME = "ptn";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** n URL-safe chars from CSPRNG bytes (64-char alphabet divides 256: no modulo bias). */
export function randomUrlSafe(n: number): string {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[b[i]! & 63];
  return s;
}

export const newToken = (): string => randomUrlSafe(50);
export const isToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{50}$/.test(t);

/** playerId = base64url(HMAC-SHA256(SESSION_SECRET, token)).slice(0,10) (ARCH 7) */
export function playerIdFor(secret: string, token: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url").slice(0, 10);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

export function buildSetCookie(token: string, secure: boolean): string {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const newGameId = (): string => "ptl" + randomUrlSafe(21);
export const GAME_ID_RE = /^ptl[A-Za-z0-9_-]{21}$/;
