// B1: 2/9/10 seats + rabbit hunt reveal at 1440x900 (or argv w h).
import { session, shot, sleep, whoseTurn, act, waitFor } from "./lib.mjs";
const w = +(process.argv[2] ?? 1440), vh = +(process.argv[3] ?? 900); const tag = `-${w}x${vh}`;
for (const n of [2, 9, 10]) {
  const s = await session({ n, w, h: vh });
  try { await sleep(1800); await shot(s.ps[0], `40-seats-${n}-owner`, tag); if (n >= 9) await shot(s.ps[4], `40-seats-${n}-guest5`, tag); } finally { await s.h.close(); }
}
const s = await session({ n: 3, w, h: vh, config: { rabbitHunt: true } });
try {
  for (let i = 0; i < 2; i++) { const t = await whoseTurn(s.ps, 20000); await act(t, "fold"); }
  await sleep(1200);
  await shot(s.ps[0], "41-rabbit-bar-owner", tag);
  const reveal = await s.ps[0].page.$(".reveal-button");
  if (reveal) { await reveal.click(); await sleep(1500); await shot(s.ps[0], "42-rabbit-revealed-owner", tag); await shot(s.ps[1], "42-rabbit-other-viewer", tag); }
  console.log("reveal button:", !!reveal);
} finally { await s.h.close(); }
