// Builds the web app and the server bundle, then assembles .artifacts/pokerthen.zip for deployment.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, '.artifacts');
const stage = join(out, 'deploy');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
run('npm run build');
cpSync(join(root, 'apps/server/dist/server.cjs'), join(stage, 'server.cjs'));
cpSync(join(root, 'apps/web/dist'), join(stage, 'public'), { recursive: true });
writeFileSync(join(stage, 'package.json'), JSON.stringify({
  name: 'pokerthen-deploy', version: '0.1.0', private: true, main: 'server.cjs',
  scripts: { start: 'node server.cjs' }, engines: { node: '>=22' },
}, null, 2));
run(`zip -qr ../pokerthen.zip .`, stage);
console.log('\nPackaged', join(out, 'pokerthen.zip'));
