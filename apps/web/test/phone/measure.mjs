/** Geometry QA: SPEC 5.2-5.6 / 6.1 / 6.3 / 12.3 / 13.2 numbers at 5 phone viewports (1 px tolerance). Usage: node test/phone/measure.mjs */
import { launch, open, rect, remPx, PHONES } from "./lib.mjs";

// [id, scenario, selector, index, [x,y,w,h] measured @390x844 (null = don't check), prep?]
const R390 = {
  canvas: [0, 71, 390, 702],
  rem: 22.464
};
const SIT = async (p) => p.evaluate(() => window.__patch((v) => ({ ...v, seats: v.seats.map((x) => (x.player ? x : { ...x, canSit: true })) })));
const T = (id, scenario, sel, i, box, prep, only) => ({ id, scenario, sel, i, box, prep, only });
const CHECKS = [
  T("seat1-occupied", "turn-facing-bet", ".table-player-1", 0, [139.3, 610.1, 112.3, 88.7]),
  T("seat6-occupied", "turn-facing-bet", ".table-player-6", 0, [139.3, 71, 112.3, 88.7]),
  T("seat8-occupied", "turn-facing-bet", ".table-player-8", 0, [274.3 + 0, 244 + 0, 112.3, 88.7].map((v, k) => (k === 0 ? 277.5 : v)), null, "skip"),
  T("seat2-empty", "turn-facing-bet", ".table-player.empty.table-player-2", 0, [2.2, 520.3, 114.3, 90.7], SIT),
  T("seat3-empty", "turn-facing-bet", ".table-player.empty.table-player-3", 0, [2.2, 419.2, 114.3, 90.7], SIT),
  T("seat5-empty", "turn-facing-bet", ".table-player.empty.table-player-5", 0, [2.2, 138.4, 114.3, 90.7], SIT),
  T("seat4-empty", "turn-facing-bet", ".table-player.empty.table-player-4", 0, [2.2, 244, 114.3, 90.7], SIT),
    T("pot", "turn-facing-bet", ".table-pot-size", 0, [150.5, 317, 87.6, 24.7]),
  T("game-infos", "turn-facing-bet", ".game-infos", 0, [0, 441.6, 390, 56.2]),
  T("options-btn", "turn-facing-bet", ".top-buttons-button", 0, [6.7, 77.7, 43.1, 50.3]),
  T("aux-chat", "turn-facing-bet", ".aux-chat-bottom-buttons-ctn > *", 0, [5.5, 633.6, 83.1, 30.3]),
  T("aux-log", "turn-facing-bet", ".aux-chat-bottom-buttons-ctn > *", 1, [5.5, 663.9, 83.1, 29.3]),
  T("fullscreen", "turn-facing-bet", ".full-screen-button", 0, [348.7, 612.7, 36.8, 36.8]),
  T("hero-bet", "turn-facing-bet", ".table-player-1 .table-player-bet-value", 0, [161.7, 578, null, null]),
  T("dealer-slot3", "turn-facing-bet", ".dealer-button-ctn", 0, [116.8, 473.1, 27, 27], async (p) => p.evaluate(() => window.__patch((v) => ({ ...v, dealer: { ...v.dealer, dealerPosition: 3 } }))), 700),
  T("hero-cards-1", "turn-facing-bet", ".table-player-1 .card-container", 0, [149.6, 609.6, 56.2, 65.4]),
  // board: needs flop
  T("board-card-1", "flop", ".table-cards .card-container", 0, [49.4, 350.7, 54.6, 66.7]),
  T("board-card-2", "flop", ".table-cards .card-container", 1, [108.8, 350.7, 54.6, 66.7]),
  T("board-card-3", "flop", ".table-cards .card-container", 2, [168.3, 350.7, 54.6, 66.7]),
  // action bar
  T("bar-call", "turn-facing-bet", ".action-button.call", 0, [4.5, 712.4, 109.7, 51.7]),
  T("bar-raise", "turn-facing-bet", ".action-button.raise", 0, [118.6, 712.4, 109.7, 51.7]),
  T("bar-check", "turn-facing-bet", ".action-button.check", 0, [232.8, 712.4, 74.1, 51.7]),
  T("bar-fold", "turn-facing-bet", ".action-button.fold", 0, [311.4, 712.4, 74.1, 51.7]),
  T("your-turn", "turn-facing-bet", ".action-signal", 0, [301, 654, 79.8, 14]),
  T("timebank-chip", "turn-timebank", ".time-bank.suspended-action", 0, [259.7, 671.9, 125.8, 33.7]),
  T("timebank-chip-high", "turn-timebank", ".time-bank.suspended-action", 0, [259.7, 658.5, 125.8, 33.7], async (p) => p.click(".action-button.raise")),
  T("checkorfold-chip", "offturn-checkorfold", ".check-or-fold", 0, [259.7, 671.9, 125.8, 33.7]),
  // bet panel
  T("bp-form", "turn-facing-bet", ".raise-controller-form", 0, [4.5, 658.4, 381, 105.6], async (p) => p.click(".action-button.raise")),
  T("bp-betcard", "turn-facing-bet", ".raise-bet-value", 0, [4.5, 627, 131.4, 68.6], async (p) => p.click(".action-button.raise")),
  T("bp-panel", "turn-facing-bet", ".raise-controller", 0, [4.5, 698.6, 250.7, 65.5], async (p) => p.click(".action-button.raise")),
  T("bp-preset1", "turn-facing-bet", ".default-bet-button", 0, [7.3, 701.3, 46.6, 27.9], async (p) => p.click(".action-button.raise")),
  T("bp-preset2", "turn-facing-bet", ".default-bet-button", 1, [56.6, 701.3, 46.6, 27.9], async (p) => p.click(".action-button.raise")),
  T("bp-preset5", "turn-facing-bet", ".default-bet-button", 4, [204.7, 701.3, 46.6, 27.9], async (p) => p.click(".action-button.raise")),
  T("bp-minus", "turn-facing-bet", ".control-button.decrease", 0, [4.5, 733.4, 48.7, 32], async (p) => p.click(".action-button.raise")),
  T("bp-plus", "turn-facing-bet", ".control-button.increase", 0, [206.4, 733.4, 48.7, 32], async (p) => p.click(".action-button.raise")),
  T("bp-back", "turn-facing-bet", ".raise-action-buttons .back", 0, [264.2, 710.1, 58.4, 51.7], async (p) => p.click(".action-button.raise")),
  T("bp-input", "turn-facing-bet", ".raise-bet-input", 0, [null, null, 126, 34.5], async (p) => p.click(".action-button.raise")),
  // others
  T("rit", "rit", ".rit-container", 0, [257.8, 686.6, 127.8, 77.4]),
  T("showhand-result", "showhand", ".show-hand-buttons", 0, [150.4, 716.1, 235.1, 47.9]),
  T("iamback", "away", ".iamback", 0, [273.2, 712.4, 112.3, 51.7]),
  T("cancel-ingress", "cancel-ingress", ".cancel-request-ingress", 0, [4.5, 712.4, 381, 51.7])
];
const CANVAS = { "390x844": [0, 71, 390, 702], "360x740": [0, 46, 360, 648], "430x932": [0, 79, 430, 774], "375x667": [2.2, 0, 370.6, 667], "768x1024": [99.6, 0, 568.9, 1024] };
const REM = { "390x844": 22.464, "360x740": 20.736, "430x932": 24.768, "375x667": 21.344, "768x1024": 32.768 };
const TOL = 1.0;
let fail = 0, total = 0;
const browser = await launch();
const ONLY = process.argv[2] ? process.argv[2].split(",") : null;
for (const p of PHONES) {
  if (ONLY && !ONLY.includes(p.name)) continue;
  const rows = [];
  const cv = CANVAS[p.name];
  const scale = REM[p.name] / REM["390x844"];
  const open_ = {};
  for (const c of CHECKS) {
    if (c.only === "skip") continue;
    const key = c.scenario + "|" + (c.prep ? c.prep.toString() : "");
    const page = await open(browser, { ...p, scenario: c.scenario });
    if (c.prep) { await c.prep(page); await new Promise((r) => setTimeout(r, c.id.startsWith("dealer") ? 800 : 400)); }
    const r = await rect(page, c.sel, c.i);
    if (c.id === "bp-input") {
      const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".raise-bet-input")).fontSize));
      rows.push([c.id + " font", fs, 40.4 * scale]);
    }
    await page.close();
    if (!r) { rows.push([c.id, "MISSING"]); fail++; total++; continue; }
    const exp = c.box.map((v, k) => {
      if (v == null) return null;
      const base = k === 0 ? R390.canvas[0] : k === 1 ? R390.canvas[1] : 0;
      return k < 2 ? cv[k] + (v - base) * scale : v * scale;
    });
    const act = [r.x, r.y, r.w, r.h];
    const bad = exp.map((e, k) => (e == null ? false : Math.abs(e - act[k]) > TOL));
    total++;
    if (bad.some(Boolean)) fail++;
    rows.push([c.id, act.map((v) => v.toFixed(1)).join(","), exp.map((v) => (v == null ? "-" : v.toFixed(1))).join(","), bad.some(Boolean) ? "FAIL" : "ok"]);
  }
  // canvas + rem
  const page = await open(browser, { ...p, scenario: "turn-facing-bet" });
  const cr = await rect(page, "#canvas");
  const rem = await remPx(page);
  await page.close();
  const okC = [cr.x, cr.y, cr.w, cr.h].every((v, k) => Math.abs(v - cv[k]) <= 0.6) && Math.abs(rem - REM[p.name]) < 0.01;
  total++; if (!okC) fail++;
  console.log(`\n== ${p.name}  canvas ${[cr.x, cr.y, cr.w, cr.h].map((v) => v.toFixed(1))} rem ${rem.toFixed(3)} ${okC ? "ok" : "FAIL"}`);
  for (const row of rows) if (process.env.VERBOSE || String(row[3]) !== "ok") console.log("  ", row.join("  "));
}
await browser.close();
console.log(`\n${total - fail}/${total} checks within ${TOL}px`);
process.exit(fail ? 1 : 0);
