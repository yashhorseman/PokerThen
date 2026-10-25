import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer } from './server';

async function main() {
  const isAzure = !!process.env.WEBSITE_SITE_NAME;
  // Azure App Service (Linux) keeps /home across restarts and deployments
  const dataDir = resolve(process.env.DATA_DIR ?? (isAzure ? '/home/data' : join(process.cwd(), 'data')));
  mkdirSync(dataDir, { recursive: true });

  /** Session/deck-encryption secret: from env, else generated once and kept in the data dir. */
  const secret = (): string => {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 24) return process.env.SESSION_SECRET;
    const f = join(dataDir, '.secret');
    if (existsSync(f)) return readFileSync(f, 'utf8').trim();
    const s = randomBytes(32).toString('hex');
    writeFileSync(f, s, { mode: 0o600 });
    return s;
  };

  const here = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [process.env.STATIC_DIR, join(here, 'public'), join(process.cwd(), 'public'), join(process.cwd(), 'apps/web/dist')];
  const staticDir = candidates.find((p): p is string => !!p && existsSync(join(p, 'index.html')));

  const running = await startServer({
    port: Number(process.env.PORT ?? process.env.WEBSITES_PORT ?? 8787),
    dataDir,
    secret: secret(),
    staticDir,
    secureCookies: process.env.SECURE_COOKIES ? process.env.SECURE_COOKIES === '1' : isAzure,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  });

  const stop = async () => { await running.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
