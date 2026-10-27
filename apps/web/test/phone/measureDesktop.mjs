/** Desktop numbers from SPEC 6.1 / 6.3 / 12.3 / 13.2 at 1440x900 (1 px tolerance). */
import { launch, open, rect } from "./lib.mjs";
const C = [
  ["rit", "rit", ".rit-container", [1220.9, 750.7, 201, 91.3]],
  ["rit-yes", "rit", ".rit-yes", [1228.1, 783, 90.7, 51.8]],
  ["rit-no", "rit", ".rit-no", [1324, 783, 90.7, 51.8]],
  ["showhand", "showhand", ".show-hand-buttons", [1208.5, 732.4, 213.4, 109.7]],
  ["bar-right-edge", "turn-facing-bet", ".game-decisions-ctn", [null, null, null, null]],
  ["bp-form", "turn-facing-bet", ".raise-controller-form", [null, null, 40 * 25.92, 4.7 * 25.92], true]
];
const b = await launch();
let bad = 0;
for (const [id, sc, sel, box, click] of C) {
  const p = await open(b, { w: 1440, h: 900, scenario: sc, orient: "landscape", mobile: false });
  if (click) { await p.click(".action-button.raise"); await new Promise((r) => setTimeout(r, 300)); }
  const r = await rect(p, sel);
  const act = [r.x, r.y, r.w, r.h];
  const ok = box.every((v, k) => v == null || Math.abs(v - act[k]) <= 1);
  if (!ok) bad++;
  console.log(id.padEnd(16), act.map((v) => v.toFixed(1)).join(","), "exp", box.map((v) => (v == null ? "-" : v.toFixed(1))).join(","), ok ? "ok" : "FAIL");
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);
