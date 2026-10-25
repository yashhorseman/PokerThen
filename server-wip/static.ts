import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.map', '.txt']);
const gzCache = new Map<string, { mtime: number; buf: Buffer }>();

export class StaticFiles {
  constructor(private root: string) {}

  resolve(urlPath: string): string | null {
    const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
    const full = join(this.root, rel);
    if (full !== this.root && !full.startsWith(this.root + sep)) return null; // path traversal
    return full;
  }
  has(urlPath: string): boolean {
    try { const f = this.resolve(urlPath); return !!f && existsSync(f) && statSync(f).isFile(); } catch { return false; }
  }

  serve(req: IncomingMessage, res: ServerResponse, urlPath: string, extra: Record<string, string> = {}): boolean {
    let file: string | null;
    try { file = this.resolve(urlPath); } catch { return false; }
    if (!file || !existsSync(file)) return false;
    const st = statSync(file);
    if (!st.isFile()) return false;
    const ext = extname(file).toLowerCase();
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers: Record<string, string> = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache', ...extra };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (acceptsGzip && COMPRESSIBLE.has(ext) && st.size > 512) {
      let c = gzCache.get(file);
      if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, buf: gzipSync(readFileSync(file)) }; gzCache.set(file, c); }
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': String(c.buf.length), Vary: 'Accept-Encoding' });
      res.end(req.method === 'HEAD' ? undefined : c.buf);
      return true;
    }
    res.writeHead(200, { ...headers, 'Content-Length': String(st.size) });
    if (req.method === 'HEAD') { res.end(); return true; }
    createReadStream(file).pipe(res);
    return true;
  }
}
