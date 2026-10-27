import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".map": "application/json",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav"
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".webmanifest"]);

export function resolvePublicDir(override: string | null): string {
  if (override) return override;
  const cands: string[] = [];
  if (typeof __dirname !== "undefined") cands.push(join(__dirname, "public"));
  cands.push(resolve(process.cwd(), "dist/app/public"), resolve(process.cwd(), "public"));
  return cands.find((c) => existsSync(join(c, "index.html"))) ?? cands[0]!;
}

const gzCache = new Map<string, { mtime: number; buf: Buffer }>();

/** Serve a file under publicDir. Hashed build assets (/assets/*) are immutable; HTML is no-cache. Returns false when not found. */
export async function serveFile(req: IncomingMessage, res: ServerResponse, publicDir: string, rel: string, extraHeaders: Record<string, string> = {}): Promise<boolean> {
  const root = resolve(publicDir);
  const file = resolve(root, "." + sep + normalize(rel).replace(/^([/\\])+/, ""));
  if (file !== root && !file.startsWith(root + sep)) return false;
  let st;
  try { st = statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = extname(file).toLowerCase();
  const type = TYPES[ext] ?? "application/octet-stream";
  const relUrl = "/" + file.slice(root.length + 1).split(sep).join("/");
  const cache = ext === ".html" ? "no-cache" : relUrl.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  const headers: Record<string, string | number> = { "content-type": type, "cache-control": cache, ...extraHeaders };
  const wantsGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? "")) && st.size > 512;
  if (wantsGzip) {
    let c = gzCache.get(file);
    if (!c || c.mtime !== st.mtimeMs) {
      c = { mtime: st.mtimeMs, buf: gzipSync(await readFile(file)) };
      gzCache.set(file, c);
    }
    headers["content-encoding"] = "gzip"; headers["vary"] = "Accept-Encoding"; headers["content-length"] = c.buf.length;
    res.writeHead(200, headers);
    if (req.method === "HEAD") res.end(); else res.end(c.buf);
    return true;
  }
  headers["content-length"] = st.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") { res.end(); return true; }
  createReadStream(file).on("error", () => res.destroy()).pipe(res);
  return true;
}
