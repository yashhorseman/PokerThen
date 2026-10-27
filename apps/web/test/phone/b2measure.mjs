// B2: SPEC phone geometry on the REAL app (real server+engine). node b2measure.mjs [390x844,...]
import { createHarness, sleep } from "../../../../tests/e2e/harness/index.mjs";
import { setupTable, clickBtn, whoseTurn, act } from "../../../../tests/e2e/harness/ui.mjs";
const VPS = (process.argv[2] ?? "390x844,360x740,430x932,375x667,768x1024").split(",");
const CANVAS = { "390x844": [0, 71, 390, 702], "360x740": [0, 46, 360, 648], "430x932": [0, 79, 430, 774], "375x667": [2.2, 0, 370.6, 667], "768x1024": [99.6, 0, 568.9, 1024] };
const REM = { "390x844": 22.464, "360x740": 20.736, "430x932": 24.768, "375x667": 21.344, "768x1024": 32.768 };
const A = [ // id, selector, idx, box@390 (null = skip)  [x,y,w,h]
  ["seat1", ".table-player-1", 0, [139.3, 610.1, 112.3, 88.7]],
  ["pot", ".table-pot-size", 0, [150.5, 317, 87.6, 24.7]],
  ["game-infos", ".game-infos", 0, [0, 441.6, 390, 56.2]],
  ["options-btn", ".top-buttons-button", 0, [6.7, 77.7, 43.1, 50.3]],
  ["aux-chat", ".aux-chat-bottom-buttons-ctn > *", 0, [5.5, 633.6, 83.1, 30.3]],
  ["log-btn", ".pt-log-button", 0, [5.5, 663.9, 83.1, 29.3]],
  ["fullscreen", ".full-screen-button", 0, [348.7, 612.7, 36.8, 36.8]],
  ["hero-cards-1", ".table-player-1 .card-container", 0, [149.6, 609.6, 56.2, 65.4]],
  ["bar-call", ".action-button.call", 0, [4.5, 712.4, 109.7, 51.7]],
  ["bar-raise", ".action-button.raise", 0, [118.6, 712.4, 109.7, 51.7]],
  ["bar-check", ".action-button.check", 0, [232.8, 712.4, 74.1, 51.7]],
  ["bar-fold", ".action-button.fold", 0, [311.4, 712.4, 74.1, 51.7]],
  ["your-turn", ".action-signal", 0, [301, 654, 79.8, 14]],
  ["timebank-chip", ".time-bank.suspended-action", 0, [259.7, 671.9, 125.8, 33.7]],
];
const B = [
  ["bp-form", ".raise-controller-form", 0, [4.5, 658.4, 381, 105.6]],
  ["bp-betcard", ".raise-bet-value", 0, [4.5, 627, 131.4, 68.6]],
  ["bp-panel", ".raise-controller", 0, [4.5, 698.6, 250.7, 65.5]],
  ["bp-preset1", ".default-bet-button", 0, [7.3, 701.3, 46.6, 27.9]],
  ["bp-preset5", ".default-bet-button", 4, [204.7, 701.3, 46.6, 27.9]],
  ["bp-minus", ".control-button.decrease", 0, [4.5, 733.4, 48.7, 32]],
  ["bp-plus", ".control-button.increase", 0, [206.4, 733.4, 48.7, 32]],
  ["bp-back", ".raise-action-buttons .back", 0, [264.2, 710.1, 58.4, 51.7]],
  ["bp-timebank-high", ".time-bank.suspended-action", 0, [259.7, 658.5, 125.8, 33.7]],
];
let fail = 0, total = 0;
async function check(page, vp, list) {
  const cv = CANVAS[vp], sc = REM[vp] / REM["390x844"];
  for (const [id, sel, i, box] of list) {
    const r = await page.evaluate((s, i) => { const e = document.querySelectorAll(s)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, sel, i);
    total++;
    if (!r) { fail++; console.log("  MISSING", id); continue; }
    const exp = box.map((v, k) => (k === 0 ? cv[0] + v * sc : k === 1 ? cv[1] + (v - 71) * sc : v * sc));
    const bad = exp.some((e, k) => Math.abs(e - r[k]) > 1);
    if (bad) { fail++; console.log("  FAIL", id, r.map((v) => v.toFixed(1)).join(","), "exp", exp.map((v) => v.toFixed(1)).join(",")); }
  }
}
for (const vp of VPS) {
  const [W, H] = vp.split("x").map(Number);
  const h = await createHarness({});
  try {
    const a = await h.player("Alice"); const b = await h.player("Bob"); const c = await h.player("Carol", { phone: true, width: W, height: H });
    await setupTable(h, a, [[b, 2, "Bob"], [c, 3, "Carol"]]);
    await clickBtn(a, /start game/i); await sleep(2000);
    const all = [a, b, c];
    let t = await whoseTurn(all);
    while (t !== c) { await act(t, "raise 60"); t = await whoseTurn(all); }
    await sleep(3500);
    console.log(`== ${vp}`);
    const cr = await c.page.evaluate(() => { const r = document.querySelector("#canvas").getBoundingClientRect(); return [r.x, r.y, r.width, r.height, parseFloat(getComputedStyle(document.documentElement).fontSize)]; });
    console.log("  canvas", cr.map((v) => v.toFixed(2)).join(","), "exp", CANVAS[vp].join(","), REM[vp]);
    await check(c.page, vp, A);
    await c.page.click(".action-button.raise"); await sleep(500);
    await check(c.page, vp, B);
  } catch (e) { console.log("ERR", e.message); fail++; } finally { await h.close(); }
}
console.log(`${total - fail}/${total} ok`);
