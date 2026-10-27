// Starts the real PokerThen server (dist/app/server.cjs, or tsx apps/server/src/main.ts when no build exists) on a free port.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

/**
 * opts: { dataDir?, decks?: string[][] (scripted decks, uses DEV_FIXED_DECKS), env?: {}, quiet?: boolean }
 * returns { url, port, dataDir, proc, stop(), restart(), kill() }
 */
export async function startServer(opts = {}) {
  const ownsDir = !opts.dataDir;
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), "pt-e2e-"));
  let decksFile = null;
  if (opts.decks) { decksFile = join(dataDir + "-decks.json"); writeFileSync(decksFile, JSON.stringify(opts.decks)); }
  const bundle = join(ROOT, "dist/app/server.cjs");
  const useBundle = existsSync(bundle) && !process.env.E2E_TSX;
  const self = { dataDir, proc: null, port: 0, url: "" };

  async function launch() {
    self.port = self.port || (await freePort());
    self.url = `http://127.0.0.1:${self.port}`;
    const env = { ...process.env, PORT: String(self.port), DATA_DIR: dataDir, NODE_ENV: "test", SESSION_SECRET: "e2e-secret", ...(decksFile ? { DEV_FIXED_DECKS: decksFile } : {}), ...(opts.env ?? {}) };
    const [cmd, args] = useBundle ? ["node", [bundle]] : [join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "apps/server/src/main.ts")]];
    self.proc = spawn(cmd, args, { env, cwd: ROOT, stdio: opts.quiet === false ? "inherit" : ["ignore", "pipe", "pipe"] });
    self.output = "";
    self.proc.stdout?.on("data", (d) => (self.output += d));
    self.proc.stderr?.on("data", (d) => (self.output += d));
    for (let i = 0; i < 100; i++) {
      if (self.proc.exitCode !== null) throw new Error("server exited early:\n" + self.output);
      try { if ((await fetch(self.url + "/healthz")).ok) return; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("server did not start:\n" + self.output);
  }
  const waitExit = () => new Promise((r) => (self.proc.exitCode !== null ? r() : self.proc.once("exit", r)));
  self.stop = async () => { if (self.proc?.exitCode === null) { self.proc.kill("SIGTERM"); await waitExit(); } };
  /** SIGKILL: no graceful flush, proves crash recovery */
  self.kill = async () => { if (self.proc?.exitCode === null) { self.proc.kill("SIGKILL"); await waitExit(); } };
  self.restart = async ({ crash = false } = {}) => { await (crash ? self.kill() : self.stop()); await launch(); };
  self.dispose = async () => { await self.stop(); if (ownsDir) rmSync(dataDir, { recursive: true, force: true }); if (decksFile) rmSync(decksFile, { force: true }); };
  await launch();
  return self;
}
