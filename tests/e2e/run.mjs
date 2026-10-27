// E2E runner (W3). `npm run test:e2e [-- <filter>] [--headed]`.
// Scenarios: tests/e2e/scenarios/<wN>-E<k>-*.mjs, each `export default async function (h) {...}` (h = Harness) and optional
// `export const options = { decks, env }` passed to the server. Harness smoke (no browser) always runs first.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createHarness } from "./harness/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const args = process.argv.slice(2);
if (args.includes("--headed")) process.env.E2E_HEADED = "1";
const filter = args.find((a) => !a.startsWith("--"));

if (!existsSync(join(root, "dist/app/server.cjs"))) {
  console.log("[e2e] no dist/app/server.cjs: bundling the server (server-only)");
  execFileSync("node", [join(root, "scripts/build.mjs"), "--server-only"], { stdio: "inherit", cwd: root });
}

const dir = join(here, "scenarios");
const files = [
  join(here, "harness/smoke.mjs"),
  ...(existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort().map((f) => join(dir, f)) : [])
].filter((f) => !filter || f.includes(filter));

let failed = 0;
for (const f of files) {
  const name = f.slice(here.length + 1);
  const mod = await import(pathToFileURL(f).href);
  const h = await createHarness(mod.options ?? {});
  const t0 = Date.now();
  try {
    await mod.default(h);
    const errs = h.players.flatMap((p) => p.errors.map((e) => `${p.name}: ${e}`));
    if (errs.length && !mod.options?.allowConsoleErrors) throw new Error("console errors:\n  " + errs.join("\n  "));
    console.log(`PASS ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e.stack ?? e}`);
    for (const p of h.players) await p.shoot("fail-" + name.replace(/\W+/g, "_")).catch(() => {});
    if (h.server.output) console.log("--- server output ---\n" + h.server.output.slice(-2000));
  } finally {
    await h.close();
  }
}
console.log(`${files.length - failed}/${files.length} scenarios passed`);
process.exit(failed ? 1 : 0);
