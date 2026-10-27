import { session, shot, sleep, whoseTurn, act, OUT } from "./lib.mjs";
const s = await session({ n: 3 });
try {
  const [a, b, c] = s.ps;
  await sleep(1000);
  const t = await whoseTurn(s.ps);
  await sleep(500);
  for (const p of s.ps) await shot(p, "x-preflop-" + p.name);
  console.log("turn:", t.name);
} finally { await s.h.close(); }
