// Tiny reporter for the Phase C security suite.
//   ok(id, cond, detail)              hard check (PASS / FAIL)
//   defect(id, req, cond, detail)     security/fairness defect: PASS when `cond` holds, otherwise DEFECT (+ the docs/requests file that fixes it)
//   info(id, text)                    measurement worth recording
// Exit code: 1 when anything FAILed or DEFECTed (use --allow-known to exit 0 when only DEFECTs remain).
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const R = { pass: 0, fail: 0, defect: 0, items: [] };
const OUT = process.env.PT_SEC_RESULTS || "";
let current = "";

function emit(kind, id, detail, req) {
  const line = `${kind.padEnd(6)} ${id}${detail ? "  " + detail : ""}${req ? `  [fix: docs/requests/${req}.md]` : ""}`;
  console.log(line);
  R.items.push({ section: current, kind, id, detail: detail ?? "", req: req ?? null });
  if (OUT) { try { mkdirSync(dirname(OUT), { recursive: true }); appendFileSync(OUT, JSON.stringify({ section: current, kind, id, detail: detail ?? "", req: req ?? null }) + "\n"); } catch { /* ignore */ } }
}
export function section(name) { current = name; console.log(`\n== ${name}`); }
export function ok(id, cond, detail = "") {
  if (cond) { R.pass++; emit("PASS", id, detail && cond !== true ? detail : ""); } else { R.fail++; emit("FAIL", id, detail); }
  return !!cond;
}
export function defect(id, req, cond, detail = "") {
  if (cond) { R.pass++; emit("PASS", id, ""); } else { R.defect++; emit("DEFECT", id, detail, req); }
  return !!cond;
}
export function info(id, text) { emit("INFO", id, text); }
export function finish(name = "") {
  console.log(`\n${name} summary: ${R.pass} pass, ${R.fail} FAIL, ${R.defect} DEFECT`);
  const allowKnown = process.argv.includes("--allow-known");
  const bad = R.fail + (allowKnown ? 0 : R.defect);
  process.exitCode = bad > 0 ? 1 : 0;
  if (process.env.PT_SEC_SUMMARY) { try { writeFileSync(process.env.PT_SEC_SUMMARY, JSON.stringify({ name, pass: R.pass, fail: R.fail, defect: R.defect })); } catch { /* ignore */ } }
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(pred, { timeout = 5000, every = 25, what = "condition" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await sleep(every);
  }
}
