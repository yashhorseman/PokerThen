// Animation timing QA (SPEC 7.2/4.8): flip stagger, dealer slide, glow classes.
import { start, open } from "./lib.mjs";
const { browser, url, close } = await start();
let fail = 0;
const page = await open(browser, url, 1440, 900, { youSeat: 1, players: 4, street: "pre" });
await page.evaluate(() => { window.__calls.length = 0; window.__t0 = performance.now(); window.__setScenario({ youSeat: 1, players: 4, street: "flop" }); });
await new Promise((r) => setTimeout(r, 900));
const calls = await page.evaluate(() => window.__calls.filter((c) => c.startsWith("play:card-place")).map((c) => +c.split("@")[1]));
const t0 = await page.evaluate(() => window.__t0);
const rel = calls.map((c) => c - t0), gaps = calls.slice(1).map((c, i) => c - calls[i]);
console.log("flop flips at", rel.map(Math.round), "gaps", gaps.map(Math.round));
if (calls.length !== 3 || rel[0] < 140 || rel[0] > 215 || gaps.some((g) => g < 146 || g > 154)) { fail++; console.log("FAIL flip stagger"); }
// turn: single card
await page.evaluate(() => { window.__calls.length = 0; window.__t0 = performance.now(); window.__setScenario({ youSeat: 1, players: 4, street: "turn" }); });
await new Promise((r) => setTimeout(r, 500));
const c2 = await page.evaluate(() => window.__calls.filter((c) => c.startsWith("play:card-place")).map((c) => +c.split("@")[1] - window.__t0));
console.log("turn flip at", c2.map(Math.round));
if (c2.length !== 1 || c2[0] < 140 || c2[0] > 215) { fail++; console.log("FAIL turn flip"); }
// reconnect mount: pre-existing cards already flipped, no sound
const p2 = await browser.newPage(); await p2.setViewport({ width: 1440, height: 900 }); await p2.evaluateOnNewDocument(() => { window.__initial = { youSeat: 1, players: 4, street: "river" }; }); await p2.goto(url, { waitUntil: "networkidle0" }); await new Promise((r) => setTimeout(r, 600));
const n = await p2.evaluate(() => ({ plays: window.__calls.filter((c) => c.startsWith("play:")).length, flipped: document.querySelectorAll(".table-cards .card-flipper.flipped").length }));
console.log("first mount", n);
if (n.plays !== 0 || n.flipped !== 5) { fail++; console.log("FAIL first mount"); }
// flip transition is .15s rotateY
const tr = await page.evaluate(() => getComputedStyle(document.querySelector(".table-cards .card-flipper")).transitionDuration);
console.log("flip transition", tr); if (tr !== "0.15s") { fail++; console.log("FAIL flip duration"); }
// dealer slide .5s, glow classes
const d = await page.evaluate(() => { const e = document.querySelector(".dealer-button-ctn"); const c = getComputedStyle(e); return [c.transitionDuration, c.transitionProperty]; });
console.log("dealer transition", d); if (d[0] !== "0.5s") { fail++; console.log("FAIL dealer"); }
const g = await page.evaluate(() => { const e = document.querySelector(".decision-current"); return e && getComputedStyle(e, "::before").animationName + " " + getComputedStyle(e, "::before").animationDuration; });
console.log("turn glow", g); if (!/glow-current .*0\.4s/.test(g)) { fail++; console.log("FAIL glow"); }
await page.evaluate(() => window.__setScenario({ youSeat: 1, players: 4, street: "showdown" }));
await new Promise((r) => setTimeout(r, 200));
const w = await page.evaluate(() => { const e = document.querySelector(".winner"); const c = getComputedStyle(e, "::before"); return c.animationName + " | " + c.animationDuration + " | " + c.animationDelay; });
console.log("winner glow", w); if (!/glow-grow, glow-decrease, glow-pulse \| 1s, 1s, 2s \| 0s, 1s, 2s/.test(w)) { fail++; console.log("FAIL winner glow"); }
// timer bar: initial 20s+1s style split and 100ms redraw
const tw = await page.evaluate(() => window.__setScenario({ youSeat: 1, players: 4, street: "pre", decisionSeat: 2 }));
await new Promise((r) => setTimeout(r, 300));
const widths = await page.evaluate(async () => { const a = []; const e = document.querySelector(".time-to-talk .normal-time"); for (let i = 0; i < 5; i++) { a.push(e.style.width); await new Promise((r) => setTimeout(r, 105)); } return a; });
console.log("timer widths", widths); if (new Set(widths).size < 4) { fail++; console.log("FAIL timer redraw"); }
await close();
process.exit(fail ? 1 : 0);
