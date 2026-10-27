// Screenshot QA: node test/table/shots.mjs  -> research-scratch/shots/w5/*.png
import { start, open } from "./lib.mjs";
import { mkdirSync } from "node:fs";
const out = new URL("../../../../research-scratch/shots/w5/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const scenarios = {
  "spectator-waiting": { youSeat: null, players: 4, tableStatus: "waiting" },
  "owner-alone": { youSeat: 1, players: 1, tableStatus: "waiting" },
  "preflop-4": { youSeat: 1, players: 4, street: "pre" },
  "hero-seat6-of-6": { youSeat: 6, players: 6, street: "pre", decisionSeat: 6 },
  flop: { youSeat: 1, players: 5, street: "flop", decisionSeat: 2 },
  river: { youSeat: 1, players: 4, street: "river" },
  showdown: { youSeat: 1, players: 4, street: "showdown" },
  "two-runs": { youSeat: 1, players: 3, street: "twoRuns" },
  "all-in-equity": { youSeat: 1, players: 3, street: "allin" },
  rabbit: { youSeat: 1, players: 4, street: "rabbit" },
  "ten-seats": { youSeat: 1, players: 10, street: "flop" },
  "long-name": { youSeat: 1, players: 4, street: "pre", longName: true }
};
const { browser, url, close } = await start();
const only = process.argv[2];
for (const [vw, vh] of [[1440, 900], [1024, 768]]) {
  for (const [name, sc] of Object.entries(scenarios)) {
    if (only && !name.includes(only)) continue;
    const page = await open(browser, url, vw, vh, sc);
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${out}${name}-${vw}x${vh}.png` });
    if (page.errors.length) console.log(name, vw, "ERRORS", page.errors.slice(0, 3));
    await page.close();
  }
}
await close();
console.log("done");
