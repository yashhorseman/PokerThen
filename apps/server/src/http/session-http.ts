import type { IncomingMessage, ServerResponse } from "node:http";
import type { Env } from "../env.js";
import { isSecureRequest } from "../security.js";
import { COOKIE_NAME, buildSetCookie, isToken, newToken, parseCookies, playerIdFor } from "../session.js";

export interface Me { token: string; id: string }

/** Cookie `ptn`, else the optional cookie-less fallbacks (header x-user-token / WS query ut) [SPEC 1.4]. */
export function identify(req: IncomingMessage, env: Env, utQuery?: string | null): Me | null {
  const c = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const h = req.headers["x-user-token"];
  const token = [c, Array.isArray(h) ? h[0] : h, utQuery].find((t) => isToken(t));
  return token && isToken(token) ? { token, id: playerIdFor(env.sessionSecret, token) } : null;
}

/** Existing session or a freshly minted one (Set-Cookie queued on the response). */
export function ensureSession(req: IncomingMessage, res: ServerResponse, env: Env): Me {
  const me = identify(req, env);
  if (me) return me;
  const token = newToken();
  const prev = res.getHeader("set-cookie");
  const cookie = buildSetCookie(token, isSecureRequest(req, env));
  res.setHeader("set-cookie", prev ? [...(Array.isArray(prev) ? prev : [String(prev)]), cookie] : cookie);
  return { token, id: playerIdFor(env.sessionSecret, token) };
}
