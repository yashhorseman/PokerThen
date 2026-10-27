// Geometry QA vs SPEC 4 numbers: node apps/web/test/table/geometry.mjs  (1 px tolerance, exit 1 on failure)
import { start, open } from "./lib.mjs";

const SEATS = [[82, 53], [82, 29], [66, 8], [40, 2.5], [14, 8], [2, 29], [2, 53], [14, 74], [40, 80.5], [66, 75]];
const DEALER = [[19.7, 28.5], [19.4, 19.7], [18.1, 15.7], [13.6, 11.0], [7.7, 12.3], [4.5, 25.2], [4.5, 28.5], [8.5, 40.7], [14.4, 42.7], [18.1, 37.9]];
// bet pill [prop, value%] pairs relative to the seat box (SPEC 4.7)
const BET = [{ top: -78, left: 9 }, { top: -78, left: 55 }, { top: -30, left: 103 }, { top: 21, left: 107 }, { top: 82, left: 102 }, { top: 130, left: 45 }, { top: 130, left: 18 }, { right: 103, top: 82 }, { right: 110, top: 22 }, { right: 105, top: -32 }];

let fails = 0, checks = 0;
const rows = [];
function expect(label, got, want, tol = 1) {
  checks++;
  const ok = Math.abs(got - want) <= tol;
  if (!ok) { fails++; rows.push(`FAIL ${label}: got ${got.toFixed(2)} want ${want.toFixed(2)}`); }
}

const R = (page, sel, i = 0) => page.evaluate((s, n) => { const e = document.querySelectorAll(s)[n]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel, i);
const CS = (page, sel, prop) => page.evaluate((s, p) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; }, sel, prop);

const { browser, url, close } = await start();
for (const [vw, vh] of [[1440, 900], [1024, 768]]) {
  const page = await open(browser, url, vw, vh, { youSeat: null, players: 10, street: "flop", allBets: true, dealerSeat: 1, decisionSeat: 2 });
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const cv = await R(page, "#canvas");
  const tag = `${vw}x${vh}`;
  expect(`${tag} rem`, rem, 0.032 * cv.h, 0.01);
  const t = await R(page, ".table");
  expect(`${tag} table w`, t.w, 55.55 * rem, 1); expect(`${tag} table h`, t.h, 26.25 * rem, 1);
  expect(`${tag} table y`, t.y, cv.y, 1);

  // 4.4 seats
  for (let p = 1; p <= 10; p++) {
    const s = await R(page, `.table-player-${p}`);
    expect(`${tag} seat${p} left`, s.x - t.x, SEATS[p - 1][1] / 100 * t.w);
    expect(`${tag} seat${p} top`, s.y - t.y, SEATS[p - 1][0] / 100 * t.h);
    expect(`${tag} seat${p} w`, s.w, 10.0 * rem, 1.2); // 18% x 55.55rem = 9.999rem
    expect(`${tag} seat${p} h`, s.h, 3.54 * rem, 1);
  }
  // 4.5 plate internals (seat 3: hole cards + name/stack)
  const pl = await R(page, ".table-player-3 .table-player-infos-ctn");
  const nm = await R(page, ".table-player-3 .table-player-name");
  expect(`${tag} name left`, nm.x - pl.x, 5.2 * rem); expect(`${tag} name top`, nm.y - pl.y, .9 * rem); expect(`${tag} name w`, nm.w, 4.5 * rem); expect(`${tag} name h`, nm.h, .9 * rem, 1.5);
  const st = await R(page, ".table-player-3 .table-player-stack");
  expect(`${tag} stack left`, st.x - pl.x, 5.2 * rem); expect(`${tag} stack top`, st.y - pl.y, 1.8 * rem); expect(`${tag} stack w`, st.w, 3.8 * rem);
  const nf = parseFloat(await CS(page, ".table-player-3 .table-player-name", "fontSize"));
  expect(`${tag} name font`, nf, .7 * rem, .6);
  const sf = parseFloat(await CS(page, ".table-player-3 .table-player-stack", "fontSize"));
  expect(`${tag} stack font`, sf, .7 * rem, .6);
  // plate bg/radius
  const bg = await CS(page, ".table-player-3 .table-player-infos-ctn", "backgroundColor");
  checks++; if (!/rgba\(51, 51, 51, 0\.76\)/.test(bg)) { fails++; rows.push(`FAIL ${tag} plate bg ${bg}`); }

  // 4.7 bets
  for (let p = 1; p <= 10; p++) {
    const b = await R(page, `.table-player-${p} .table-player-bet-value`);
    const s = await R(page, `.table-player-${p}`);
    const spec = BET[p - 1];
    if (spec.left !== undefined) expect(`${tag} bet${p} left`, b.x - s.x, spec.left / 100 * s.w, 1.5);
    if (spec.right !== undefined) expect(`${tag} bet${p} right`, (s.x + s.w) - (b.x + b.w), 0 - 0 + spec.right / 100 * s.w - s.w * 0 + 0 - 0, 1.5 + 0) ;
    if (spec.top !== undefined) expect(`${tag} bet${p} top`, b.y - s.y, spec.top / 100 * s.h, 1.5);
  }
  const bf = parseFloat(await CS(page, ".table-player-1 .table-player-bet-value", "fontSize"));
  expect(`${tag} bet font`, bf, .8 * rem, .6);
  // pot
  const pot = await R(page, ".table-pot-size");
  expect(`${tag} pot left`, pot.x - t.x, .434 * t.w); expect(`${tag} pot top`, pot.y - t.y, .24 * t.h); expect(`${tag} pot w`, pot.w, .13 * t.w); expect(`${tag} pot h`, pot.h, 1.9 * rem);
  // board
  const row = await R(page, ".table-cards.run-1");
  expect(`${tag} board left`, row.x - t.x, .28 * t.w); expect(`${tag} board top`, row.y - t.y, .35 * t.h); expect(`${tag} board w`, row.w, 24.2 * rem);
  const c0 = await R(page, ".table-cards.run-1 .card-container", 0), c1 = await R(page, ".table-cards.run-1 .card-container", 1);
  expect(`${tag} board card w`, c0.w, 4.5 * rem); expect(`${tag} board card h`, c0.h, 5.5 * rem); expect(`${tag} board pitch`, c1.x - c0.x, 4.9 * rem);
  // hole card (unrotated size via offsetWidth)
  const hole = await page.evaluate(() => { const e = document.querySelector(".table-player-3 .hole-card-1"); return { w: e.offsetWidth, h: e.offsetHeight }; });
  expect(`${tag} hole w`, hole.w, 3.05 * rem); expect(`${tag} hole h`, hole.h, 3.7 * rem);
  const h2 = await R(page, ".table-player-3 .hole-card-2"), h1 = await R(page, ".table-player-3 .hole-card-1");
  expect(`${tag} hole pitch`, h2.x - h1.x, 2.35 * rem, 3 * rem * 0.1 + 1);
  // chrome
  const tb = await R(page, ".top-buttons-button.options");
  expect(`${tag} options w`, tb.w, 3 * rem); expect(`${tag} options h`, tb.h, 2.8 * rem); expect(`${tag} options left`, tb.x - cv.x, .5 * rem); expect(`${tag} options top`, tb.y - cv.y, 1.5 * rem);
  const rb = await R(page, ".top-right-button");
  expect(`${tag} right btn w`, rb.w, 2.1 * rem); expect(`${tag} right btn right`, (cv.x + cv.w) - (rb.x + rb.w), .8 * rem); expect(`${tag} right btn top`, rb.y - cv.y, 2.8 * rem);
  const fs = await R(page, ".full-screen-button");
  expect(`${tag} fs w`, fs.w, 2.1 * rem); expect(`${tag} fs top`, fs.y - cv.y, 7.25 * rem); expect(`${tag} fs right`, (cv.x + cv.w) - (fs.x + fs.w), 3.3 * rem);
  const gi = await R(page, ".game-infos");
  expect(`${tag} info right`, (cv.x + cv.w) - (gi.x + gi.w), .8 * rem); expect(`${tag} info top`, gi.y - cv.y, .25 * rem); expect(`${tag} info h`, gi.h, 2.5 * rem);
  const wm = await R(page, ".table-game-type");
  expect(`${tag} watermark top`, wm.y - cv.y, 14 * rem);
  // timer bar (decision seat 2)
  const tp = await R(page, ".table-player-2 .table-player-infos-ctn"), tt = await R(page, ".table-player-2 .time-to-talk");
  expect(`${tag} timer w`, tt.w, .545 * tp.w); expect(`${tag} timer h`, tt.h, .2 * rem, .6); expect(`${tag} timer bottom`, (tp.y + tp.h) - (tt.y + tt.h), 0);
  expect(`${tag} timer right`, (tp.x + tp.w) - (tt.x + tt.w), 0);

  // 4.6 dealer discs
  for (let d = 1; d <= 10; d++) {
    await page.evaluate((s) => window.__setScenario(s), { youSeat: null, players: 10, street: "flop", dealerSeat: d });
    await new Promise((r) => setTimeout(r, 1300));
    const ds = await R(page, ".dealer-button-ctn:not(.straddle-button-ctn).dealer-position-" + d);
    if (!ds) { fails++; rows.push(`FAIL ${tag} dealer ${d} missing`); continue; }
    expect(`${tag} dealer${d} top`, ds.y - t.y, DEALER[d - 1][0] * rem); expect(`${tag} dealer${d} left`, ds.x - t.x, DEALER[d - 1][1] * rem);
    if (d === 1) { expect(`${tag} dealer w`, ds.w, 1.9 * rem); expect(`${tag} dealer h`, ds.h, 1.6 * rem); }
  }

  // empty seat (spectator view, 4 players)
  await page.evaluate((s) => window.__setScenario(s), { youSeat: null, players: 4, tableStatus: "waiting" });
  await new Promise((r) => setTimeout(r, 300));
  const es = await R(page, ".table-player-7.empty .table-player-seat");
  const num = await R(page, ".table-player-7 .table-player-seat-position-number");
  expect(`${tag} seat7 num left`, num.x - es.x, .5 * rem + 1, 1.6); expect(`${tag} seat7 num top`, num.y - es.y, .5 * rem + 1, 3);
  const nfz = parseFloat(await CS(page, ".table-player-7 .table-player-seat-position-number", "fontSize"));
  expect(`${tag} seat num font`, nfz, .8 * rem, .6);
  const bd = await CS(page, ".table-player-7 .table-player-seat", "borderTopStyle");
  checks++; if (bd !== "dashed") { fails++; rows.push(`FAIL ${tag} empty seat border ${bd}`); }
  // banner (owner alone)
  await page.evaluate((s) => window.__setScenario(s), { youSeat: 1, players: 1, tableStatus: "waiting" });
  await new Promise((r) => setTimeout(r, 300));
  const bn = await R(page, ".table-warning-ctn");
  expect(`${tag} banner w`, bn.w, 30 * rem); expect(`${tag} banner top`, bn.y - t.y, .37 * t.h); expect(`${tag} banner left`, bn.x - cv.x, cv.w / 2 - 15 * rem);
  expect(`${tag} banner minh`, Math.max(bn.h, 4 * rem), bn.h, 0.5);
  // waiting message
  await page.evaluate((s) => window.__setVM({ ...window.__build(s), center: { kind: "waitOwnerDeal", text: "Waiting for the owner to deal the next hand.", seconds: null } }), { youSeat: 2, players: 3, street: "river" });
  await new Promise((r) => setTimeout(r, 300));
  const rm = await R(page, ".room-owner-paused");
  expect(`${tag} center top`, rm.y - cv.y, 16.8 * rem); expect(`${tag} center w`, rm.w, cv.w);
  expect(`${tag} center font`, parseFloat(await CS(page, ".room-owner-paused", "fontSize")), .73 * rem, .6);
  // rabbit
  await page.evaluate((s) => window.__setScenario(s), { youSeat: 1, players: 4, street: "rabbit" });
  await new Promise((r) => setTimeout(r, 300));
  const rv = await R(page, ".reveal-button"), rrow = await R(page, ".table-cards.run-1");
  expect(`${tag} reveal h`, rv.h, 1.3 * rem); expect(`${tag} reveal top`, rv.y - rrow.y, 2.1 * rem);
  const n = 2; expect(`${tag} reveal w(2 slots)`, rv.w, (4.61 * n + .29 * (n - 1) + .5) * rem);
  // errors
  if (page.errors.length) rows.push(`console: ${tag} ${page.errors.slice(0, 3).join(" | ")}`);
  await page.close();
}
await close();
console.log(rows.join("\n"));
console.log(`${checks - fails}/${checks} geometry checks passed`);
process.exit(fails ? 1 : 0);
