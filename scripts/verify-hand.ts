// Standalone fairness check: tsx scripts/verify-hand.ts <revealed-hand.json | https://host/api/games/<id>/fairness/<n>>
import { readFileSync } from "node:fs";
import { verifyReveal, type FairnessRecord, type FairnessReveal } from "@pokerthen/shared";

const src = process.argv[2];
if (!src) { console.error("usage: tsx scripts/verify-hand.ts <file.json|url>"); process.exit(2); }
const raw = src.startsWith("http") ? await (await fetch(src)).text() : readFileSync(src, "utf8");
const parsed = JSON.parse(raw) as FairnessRecord | FairnessReveal;
const rev = "reveal" in parsed ? parsed.reveal : parsed;
if (!rev) { console.error("hand not revealed yet"); process.exit(3); }
const expected = "commitment" in parsed ? { commitment: parsed.commitment, prevCommitment: (parsed as FairnessRecord).prevCommitment } : undefined;
const checks = await verifyReveal(rev, expected);
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.id}: ${c.detail}`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
