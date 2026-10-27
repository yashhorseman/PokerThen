// Load measurement: 5 tables x 10 sockets (50 total, 2 seated per table playing hands), idle RSS/CPU. `npx tsx apps/server/test/load.ts`
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, seatGuest, type TestApp } from "./helpers.js";

const dir = mkdtempSync(join(tmpdir(), "pt-load-"));
const child = spawn(join(process.cwd(), "node_modules/.bin/tsx"), ["apps/server/test/loadServer.ts"], { env: { ...process.env, PORT: "0", DATA_DIR: dir }, stdio: ["ignore", "pipe", "inherit"] });
const port = await new Promise<number>((res) => child.stdout.on("data", (d) => { const m = String(d).match(/PORT (\d+)/); if (m) res(Number(m[1])); }));
const t = { base: `http://127.0.0.1:${port}`, dir } as TestApp;
const sample = () => execFileSync("ps", ["-o", "rss=,%cpu=", "-p", String(child.pid)]).toString().trim().split(/\s+/).map(Number) as [number, number];
const before = sample();
const socks: Array<ReturnType<Client["ws"]>> = [];
for (let g = 0; g < 5; g++) {
  const owner = await new Client(t).init();
  const gid = await owner.newGame("Own" + g);
  await seatGuest(t, owner, gid, "Guest" + g, 2);
  await owner.http("POST", `/games/${gid}/start-game`, {});
  for (let i = 0; i < 10; i++) { const c = i === 0 ? owner : await new Client(t).init(); const w = c.ws(gid); await w.registered(); socks.push(w); }
}
console.log("sockets open:", socks.length);
await new Promise((r) => setTimeout(r, 25_000)); // idle: keep-alive frames + pings only
const idle = sample();
// average CPU over a 10 s window via ps cputime delta
const cpuTime = () => execFileSync("ps", ["-o", "cputime=", "-p", String(child.pid)]).toString().trim();
const toSec = (s: string) => s.split(/[:.]/).reverse().reduce((acc, p, i) => acc + Number(p) * [0.01, 1, 60, 3600][i]!, 0);
const c0 = toSec(cpuTime()); await new Promise((r) => setTimeout(r, 10_000)); const c1 = toSec(cpuTime());
console.log(`RSS before=${(before[0] / 1024).toFixed(0)} MB, with 50 sockets idle=${(idle[0] / 1024).toFixed(0)} MB; idle CPU over 10 s = ${(((c1 - c0) / 10) * 100).toFixed(1)}% of one core`);
child.kill("SIGTERM"); rmSync(dir, { recursive: true, force: true }); process.exit(0);
