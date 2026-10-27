import type { IncomingMessage } from "node:http";
import type { Env } from "./env.js";

const first = (v: string | string[] | undefined): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.split(",")[0]?.trim() || undefined;
};

export function requestHost(req: IncomingMessage, env: Pick<Env, "trustProxy">): string {
  return (env.trustProxy ? first(req.headers["x-forwarded-host"]) : undefined) ?? req.headers.host ?? "";
}

export function requestProto(req: IncomingMessage, env: Pick<Env, "trustProxy">): "http" | "https" {
  const xf = env.trustProxy ? first(req.headers["x-forwarded-proto"]) : undefined;
  if (xf) return xf.toLowerCase() === "https" ? "https" : "http";
  return (req.socket as { encrypted?: boolean }).encrypted ? "https" : "http";
}

/** Secure cookie when the client side is https, or always in production. */
export const isSecureRequest = (req: IncomingMessage, env: Env): boolean => env.isProd || requestProto(req, env) === "https";

/** `Origin` must equal https://<Host> (X-Forwarded-* when trusted) or be an allow-listed origin. Missing = rejected. */
export function isOriginAllowed(req: IncomingMessage, env: Env): boolean {
  const origin = first(req.headers.origin);
  if (!origin) return false;
  const o = origin.toLowerCase().replace(/\/+$/, "");
  const expected = `${requestProto(req, env)}://${requestHost(req, env)}`.toLowerCase();
  if (o === expected) return true;
  return [...env.allowedOrigins, ...env.devOrigins].some((a) => a.toLowerCase() === o);
}

/** Unsafe HTTP methods: Origin must match; browsers that omit Origin must send Sec-Fetch-Site: same-origin. */
export function isUnsafeRequestAllowed(req: IncomingMessage, env: Env): boolean {
  if (req.headers.origin) return isOriginAllowed(req, env);
  return req.headers["sec-fetch-site"] === "same-origin";
}

/** Last entry of a comma list (the one appended by the single trusted proxy; earlier entries are client-controlled). */
const last = (v: string | string[] | undefined): string | undefined => {
  const s = Array.isArray(v) ? v.join(",") : v;
  const parts = s?.split(",").map((x) => x.trim()).filter(Boolean);
  return parts && parts.length ? parts[parts.length - 1] : undefined;
};

/** Client IP: RIGHTMOST X-Forwarded-For entry (Azure appends ip:port; anything to its left is client-supplied and spoofable) when the proxy is trusted. */
export function clientIp(req: IncomingMessage, env: Pick<Env, "trustProxy">): string {
  let ip = (env.trustProxy ? last(req.headers["x-forwarded-for"]) : undefined) ?? req.socket.remoteAddress ?? "unknown";
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  else if (/^\[.*\]:\d+$/.test(ip)) ip = ip.slice(1, ip.indexOf("]"));
  return ip.replace(/^::ffff:/, "");
}

export function contentSecurityPolicy(host: string, env: Env): string {
  const ws = env.isProd ? `wss://${host}` : `ws://${host} wss://${host} ws://localhost:* http://localhost:*`;
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${ws}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'"
  ].join("; ");
}
