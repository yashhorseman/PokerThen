// Builds the deployable app into dist/app:
//   server.cjs        - the whole server (deps bundled; no npm install on Azure)
//   package.json      - { scripts.start: "node server.cjs" }
//   public/           - index.html, app.js, app.css, static assets
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'app');
const pub = join(out, 'public');
const watch = process.argv.includes('--watch');

const serverOpts = {
  entryPoints: [join(root, 'src/server/index.ts')],
  outfile: join(out, 'server.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: 'linked',
  logLevel: 'info',
};

const clientOpts = {
  entryPoints: { app: join(root, 'src/client/main.tsx') },
  outdir: pub,
  bundle: true,
  platform: 'browser',
  target: ['chrome100', 'safari15', 'firefox100'],
  format: 'iife',
  jsx: 'automatic',
  sourcemap: 'linked',
  minify: !watch,
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl' },
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

function copyStatic() {
  mkdirSync(pub, { recursive: true });
  const html = join(root, 'src/client/index.html');
  if (existsSync(html)) cpSync(html, join(pub, 'index.html'));
  const staticDir = join(root, 'src/client/static');
  if (existsSync(staticDir)) cpSync(staticDir, pub, { recursive: true });
  writeFileSync(
    join(out, 'package.json'),
    JSON.stringify({ name: 'pokerthen', private: true, scripts: { start: 'node server.cjs' }, engines: { node: '>=22' } }, null, 2),
  );
}

if (!watch) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyStatic();

if (watch) {
  const s = await context(serverOpts);
  const c = await context(clientOpts);
  await s.watch();
  await c.watch();
  console.log('watching…');
} else {
  await Promise.all([build(serverOpts), build(clientOpts)]);
  console.log('built dist/app');
}
