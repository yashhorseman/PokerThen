// Dev loop: esbuild --watch for server+client, and the server restarted by `node --watch`.
import { spawn } from 'node:child_process';
const b = spawn(process.execPath, ['scripts/build.mjs', '--watch'], { stdio: 'inherit' });
setTimeout(() => {
  const s = spawn(process.execPath, ['--watch', 'dist/app/server.cjs'], { stdio: 'inherit', env: { ...process.env, PORT: process.env.PORT || '3000', DATA_DIR: process.env.DATA_DIR || './data' } });
  s.on('exit', () => process.exit(0));
}, 2500);
process.on('SIGINT', () => { b.kill(); process.exit(0); });
