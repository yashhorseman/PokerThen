// usage: node b2probe.mjs WxH "<js expression returning json>"  (seats Carol on phone at seat 3 w/ 3 players, runs expr in page)
import { createHarness, sleep } from "../../../../tests/e2e/harness/index.mjs";
import { setupTable, clickBtn } from "../../../../tests/e2e/harness/ui.mjs";
const [W, H] = process.argv[2].split("x").map(Number);
const h = await createHarness({});
try {
  const a = await h.player("Alice"); const b = await h.player("Bob"); const c = await h.player("Carol", { phone: true, width: W, height: H });
  await setupTable(h, a, [[b, 2, "Bob"], [c, 3, "Carol"]]);
  await clickBtn(a, /start game/i); await sleep(2500);
  console.log(JSON.stringify(await c.page.evaluate(process.argv[3]), null, 1));
} finally { await h.close(); }
