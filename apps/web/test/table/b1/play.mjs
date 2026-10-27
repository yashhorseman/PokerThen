// B1: 3-4 players, full hand to showdown, screenshots of every street at one viewport.  node play.mjs [w] [h] [n]
import { session, shot, sleep, whoseTurn, act, bodyText, clickBtn, record, recDump } from "./lib.mjs";
const w = +(process.argv[2] ?? 1440), vh = +(process.argv[3] ?? 900), n = +(process.argv[4] ?? 4);
const tag = `-${w}x${vh}`;
const s = await session({ n, w, h: vh, start: false });
try {
  const [a] = s.ps;
  for (const p of s.ps) await shot(p, "01-waiting-" + p.name, tag);
  await clickBtn(a, /start game/i);
  const streets = new Set(); let handDone = false; let turns = 0;
  const board = (p) => p.page.evaluate(() => document.querySelectorAll(".table-cards .board-card, .table-cards .card-container").length);
  for (let i = 0; i < 80 && !handDone; i++) {
    let t; try { t = await whoseTurn(s.ps, 3500); } catch { t = null; }
    if (!t) { await sleep(500); if (await a.page.evaluate(() => !!document.querySelector(".table-player-stack-prize"))) handDone = true; continue; }
    const nb = await board(t);
    if (!streets.has(nb)) { streets.add(nb); await sleep(700); await shot(t, `02-yourturn-board${nb}-${t.name}`, tag); for (const p of s.ps) if (p !== t) await shot(p, `02-offturn-board${nb}-${p.name}`, tag); }
    const canCheck = await t.page.evaluate(() => [...document.querySelectorAll(".action-button")].some((b) => /^check$/i.test(b.textContent.trim()) && !b.disabled && !b.classList.contains("disabled")));
    await act(t, canCheck ? "check" : "call"); turns++;
  }
  await sleep(1200);
  for (const p of s.ps) await shot(p, "03-award-" + p.name, tag);
  await sleep(2500);
  for (const p of s.ps) await shot(p, "03b-award+3.7s-" + p.name, tag);
  console.log("turns", turns, "streets", [...streets]);
} finally { await s.h.close(); }
