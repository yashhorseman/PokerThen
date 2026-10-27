// Run existing browser scenarios against an ALREADY RUNNING server (e.g. the Azure deployment).
// usage: node tests/e2e/remote-smoke.mjs https://host  scenarioFilter [scenarioFilter...]
// Leaves test tables on that server (they stay in its data folder).
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Harness } from "./harness/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [url, ...filters] = process.argv.slice(2);
if (!url || !/^https?:\/\//.test(url) || !filters.length) { console.error("usage: node tests/e2e/remote-smoke.mjs <baseUrl> <scenarioFilter>..."); process.exit(2); }

const files = readdirSync(join(here, "scenarios")).filter((f) => f.endsWith(".mjs") && filters.some((x) => f.includes(x))).sort();
let failed = 0;
for (const f of files) {
  const server = { url: url.replace(/\/$/, ""), async restart() { throw new Error("cannot restart a remote server"); }, async dispose() {} };
  const h = new Harness(server, { shotDir: join(here, "../../research-scratch/shots/azure") });
  const t0 = Date.now();
  try {
    const mod = await import(pathToFileURL(join(here, "scenarios", f)).href);
    await mod.default(h);
    console.log(`PASS ${f} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${f}: ${e?.stack ?? e}`);
  } finally {
    await h.close();
  }
}
console.log(`${files.length - failed}/${files.length} remote scenarios passed against ${url}`);
process.exit(failed ? 1 : 0);
