// B1: award windows, turn glow gap, dealer slide, chat bubble 7.2 s via MutationObserver on Alice's page.
import { session, sleep, whoseTurn, act, clickBtn, record, recDump, waitFor } from "./lib.mjs";
const s = await session({ n: 3 });
const out = [];
try {
  const [a, b] = s.ps;
  await record(a);
  // hand A: fold-win
  for (let i = 0; i < 2; i++) { const t = await whoseTurn(s.ps, 20000); await act(t, "fold"); }
  await waitFor(() => a.page.evaluate(() => window.__rec.some((r) => /stack-prize/.test(r.c) && r.k === "add")), { timeout: 8000 });
  await sleep(3600);
  // hand B: to showdown
  for (let i = 0; i < 40; i++) {
    let t; try { t = await whoseTurn(s.ps, 2500); } catch { t = null; }
    if (!t) { if (await a.page.evaluate(() => window.__rec.filter((r) => /stack-prize/.test(r.c) && r.k === "add").length) >= 2) break; continue; }
    const cc = await t.page.evaluate(() => [...document.querySelectorAll(".action-button")].some((x) => /^check$/i.test(x.textContent.trim()) && !x.disabled));
    await act(t, cc ? "check" : "call");
  }
  await sleep(500);
  // chat bubble
  await b.page.keyboard.press("m"); await sleep(300); await b.page.keyboard.type("hello bubble"); await b.page.keyboard.press("Enter");
  await sleep(8500);
  await sleep(6500);
  const rec = await recDump(a);
  const ev = (re, k) => rec.filter((r) => re.test(r.c) && (!k || r.k === k));
  const prize = ev(/stack-prize/, "add"), deal = ev(/dealer-button-ctn/), dec = ev(/decision-current|table-player-infos-ctn/).filter((r) => /decision-current/.test(r.to ?? r.c));
  const cards = rec.filter((r) => r.k === "add" && /hole-card|table-player-cards/.test(r.c));
  console.log("prize adds t:", prize.map((r) => r.t.toFixed(0)));
  console.log("hole card adds t (hand starts):", cards.map((r) => r.t.toFixed(0)).join(" "));
  console.log("dealer events:", deal.map((r) => `${r.t.toFixed(0)} ${r.k} ${r.to ?? ""}`).join(" | "));
  console.log("decision-current:", dec.map((r) => r.t.toFixed(0)).join(" "));
  const bub = rec.filter((r) => /chat-message$|table-player-chat-message/.test(r.c));
  console.log("bubble:", bub.map((r) => `${r.t.toFixed(0)} ${r.k}`).join(" | "));
  console.log("review popover:", rec.filter((r) => /review/i.test(r.c)).length);
  const first = prize[0]?.t, second = prize[1]?.t;
  const starts = [...new Set(rec.filter((r) => r.k === "add" && /table-player-cards/.test(r.c)).map((r) => Math.round(r.t / 50) * 50))];
  console.log("hand starts (rounded):", starts);
  console.log("fold-win award -> next start:", starts.filter((x) => x > first).map((x) => ((x - first) / 1000).toFixed(2)));
  console.log("showdown award -> next start:", second ? starts.filter((x) => x > second).map((x) => ((x - second) / 1000).toFixed(2)) : "n/a");
} finally { await s.h.close(); }
