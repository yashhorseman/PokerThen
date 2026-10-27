// B1: all-in preflop + run it twice + rabbit; shots and MutationObserver timings.  node rit.mjs [w] [h]
import { session, shot, sleep, whoseTurn, act, bodyText, clickBtn, record, recDump, waitFor, OUT } from "./lib.mjs";
import { writeFileSync } from "node:fs";
const w = +(process.argv[2] ?? 1440), vh = +(process.argv[3] ?? 900); const tag = `-${w}x${vh}`;
const s = await session({ n: 3, w, h: vh, config: { runItTwice: "ask_players", rabbitHunt: true } });
try {
  const [a, b, c] = s.ps;
  let t = await whoseTurn(s.ps); await sleep(400);
  await shot(t, "10-allin-yourturn-" + t.name, tag);
  await record(a);
  await act(t, "allin");
  for (let i = 0; i < 2; i++) { t = await whoseTurn(s.ps, 8000); await act(t, "call"); }
  await waitFor(() => a.page.$(".rit-container"), { timeout: 15000, what: "rit" });
  await sleep(300);
  for (const p of s.ps) await shot(p, "11-rit-prompt-" + p.name, tag);
  const tAnswer = await a.page.evaluate(() => performance.now());
  for (const p of s.ps) await p.page.click(".rit-yes").catch(() => {});
  await sleep(1800);
  await shot(a, "12-rit-after-answer-" + a.name, tag);
  const marks = [4500, 9500, 13500, 17500, 21500, 25500];
  let last = 1800;
  for (const m of marks) { await sleep(m - last); last = m; await shot(a, `13-rit-t${(m / 1000).toFixed(1)}-${a.name}`, tag); }
  await sleep(3000);
  await shot(a, "14-rit-award-" + a.name, tag); await shot(b, "14-rit-award-" + b.name, tag);
  await sleep(9000);
  await shot(a, "15-next-hand-review-" + a.name, tag);
  const rec = await recDump(a);
  writeFileSync(OUT + `rit-rec${tag}.json`, JSON.stringify({ tAnswer, rec }));
  const want = /flipped|winner|dealer|win-odds|review|rit|semi-hide|table-cards|card-container|stack-prize|hide-cards/;
  const lines = rec.filter((r) => want.test(r.c + " " + (r.to ?? ""))).map((r) => `${((r.t - tAnswer) / 1000).toFixed(3)} ${r.k} ${r.c.slice(0, 50)} ${(r.to ?? r.txt ?? "").slice(0, 60)}`);
  console.log(lines.join("\n"));
} finally { await s.h.close(); }
