// Runs the whole Phase C security suite sequentially (about 15 minutes; s06 and s08 are the long ones).
//   node tests/security/run.mjs [--allow-known]   env: PT_ROOT (audit a snapshot), PT_SEC_TMP, PT_PUBLIC (built web dir), FUZZ_TABLES/FUZZ_HANDS/FUZZ_MS
// Each script starts the REAL built server (esbuild bundle) on a temp port and DATA_DIR and kills it afterwards.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const files = ["s01-origin", "s02-cookies", "s03-authz", "s04-input", "s05-limits", "s06a-rit-leak", "s06-leak-fuzz", "s07-fairness", "s08-crash", "s09-headers-xss"];
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ["--import", "tsx", join(here, f + ".mjs"), ...process.argv.slice(2)], { stdio: "inherit", cwd: join(here, "../..") });
  if (r.status !== 0) { bad++; console.log(`>>> ${f} exited ${r.status}`); }
}
console.log(bad ? `\n${bad} script(s) reported FAIL/DEFECT` : "\nall security scripts green");
process.exit(bad ? 1 : 0);
