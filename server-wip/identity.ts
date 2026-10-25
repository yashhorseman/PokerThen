import { createHmac, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { COOKIE_NAME } from '../shared/constants';

/** Cookie `ptt` = 40-hex-char random token (HttpOnly). Player id = first 10 url-safe chars of HMAC(secret, token). Nothing is stored server-side. */
export class Identity {
  constructor(private secret: string) {}

  static parseCookies(header: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  playerIdFor(token: string): string {
    return createHmac('sha256', this.secret).update(token).digest('base64url').slice(0, 10);
  }

  tokenFrom(req: IncomingMessage): string | null {
    const t = Identity.parseCookies(req.headers.cookie)[COOKIE_NAME];
    return t && /^[0-9a-f]{40}$/.test(t) ? t : null;
  }

  /** returns the player id; sets the cookie on the response when the visitor had none */
  ensure(req: IncomingMessage, res: ServerResponse, secure: boolean): string {
    let token = this.tokenFrom(req);
    if (!token) {
      token = randomBytes(20).toString('hex');
      const attrs = [`${COOKIE_NAME}=${token}`, 'Path=/', 'Max-Age=31536000', 'HttpOnly', 'SameSite=Lax'];
      if (secure) attrs.push('Secure');
      const prev = res.getHeader('Set-Cookie');
      const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
      res.setHeader('Set-Cookie', [...list, attrs.join('; ')]);
    }
    return this.playerIdFor(token);
  }
}

/** best-effort client ip behind Azure's front end */
export function clientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}
export function isSecure(req: IncomingMessage): boolean {
  const p = req.headers['x-forwarded-proto'];
  return (Array.isArray(p) ? p[0] : p)?.split(',')[0]?.trim() === 'https' || (req.socket as { encrypted?: boolean }).encrypted === true;
}
