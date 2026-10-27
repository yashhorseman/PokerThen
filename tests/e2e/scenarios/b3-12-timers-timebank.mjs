// B3-12: decision limit 6 s + time bank 5 s refilled 1 s per hand (5 hands). Auto-activate pref OFF on Alice's page: the button reads `Activate Extra Time (5s)`,
// at the limit the server auto-folds (`Alice folds`, bank untouched) / auto-checks when free; pressing it flips to `Extra Time Activated`, the engine then waits limit+bank;
// bank drain + refill (+1 s per dealt hand) is visible in the label (research 08 e).
import { join } from "node:path";
import { makeTable, mkHand, norm, expectHas, assert, sleep, text, waitFor, seeText, soft, click, clickBtn } from "../harness/b3.mjs";

export const options = { decks: [{ pre: [0], deck: mkHand([["2c", "7d"], ["3c", "8d"]]) }] };
const label = (p) => p.page.evaluate(() => document.querySelector("button.time-bank")?.textContent?.trim() ?? null);

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob"]);
  const { P, B } = t;
  await t.cfg({ decisionLimitSec: 6, timeBankSec: 5, timeBankFillHands: 5 });
  await P.Alice.page.evaluate(() => { const k = "currentPlayer"; const o = JSON.parse(localStorage.getItem(k) || '{"version":1}'); o.autoActivateTimeBank = false; localStorage.setItem(k, JSON.stringify(o)); });
  await P.Alice.page.reload({ waitUntil: "domcontentloaded" }); await P.Alice.page.waitForSelector(".table-player");
  await clickBtn(P.Alice, /got it/i, "button", 1500).catch(() => {});
  const bank = () => t.frame().turn.bankMs[P.Alice.playerID];
  await t.start();
  // ---- hand 1: dealer Alice (SB) acts first facing the BB; she does nothing
  let a = await t.turn(); assert(a.name === "Alice", "Alice first");
  const t0 = Date.now();
  await waitFor(async () => /Activate Extra Time \(5s\)/i.test((await label(P.Alice)) ?? ""), { timeout: 3000, what: "ACTIVATE EXTRA TIME (5s) label" });
  await P.Alice.shoot("b3-12-activate-label");
  assert(!(await P.Alice.page.evaluate(() => /activated/i.test(document.querySelector("button.time-bank")?.textContent ?? ""))), "not activated automatically (pref off)");
  await waitFor(() => !t.frame().turn.taking || t.frame().turn.taking !== P.Alice.playerID, { timeout: 15000, what: "timeout fold" });
  const dt1 = Date.now() - t0;
  console.log("      hand 1: auto fold after", dt1, "ms (limit 6000 + grace)");
  assert(dt1 >= 5800 && dt1 <= 9500, "expired at the decision limit (+ <=1.5 s ATB grace): " + dt1);
  assert(bank() === 5000, "bank untouched after an auto fold with the pref off: " + bank());
  await waitFor(() => t.frame().result, { timeout: 10000, what: "result" });
  expectHas(norm(await t.log(1)), "Alice folds", "plain fold wording (no timeout text)");
  // ---- hand 2: dealer Bob; Bob calls, Alice (BB, free check) activates the bank by clicking, then idles
  await waitFor(() => t.frame().table.handNumber === 2, { timeout: 20000, what: "hand 2" });
  assert(bank() === 5000, "refill capped at 5000 at the start of hand 2");
  a = await t.turn(); assert(a.name === "Bob", "Bob (dealer) first"); a.action("PLAYER_CALL");
  await waitFor(() => t.frame().turn.taking === P.Alice.playerID, { timeout: 5000, what: "Alice's turn" });
  const t1 = Date.now();
  await sleep(1500);
  await click(P.Alice, "button.time-bank");
  await seeText(P.Alice, /Extra Time Activated/i, 2500);
  await P.Alice.shoot("b3-12-extra-time-activated");
  await waitFor(() => t.frame().turn.taking !== P.Alice.playerID, { timeout: 15000, what: "Alice's auto check at limit + bank" });
  const dt2 = Date.now() - t1 + 1500;
  console.log("      hand 2: auto check after ~", dt2, "ms (limit 6000 + bank 5000)");
  assert(dt2 >= 10500 && dt2 <= 13500, "waited limit + bank: " + dt2);
  assert(bank() <= 100, "bank drained: " + bank());
  expectHas(norm(await t.log(2)), "Alice checks", "plain check wording");
  await waitFor(() => B.Alice.myTurn, { timeout: 8000, what: "Alice first on the flop" }); B.Alice.action("PLAYER_FOLD");
  // ---- hands 3, 4: +1 s refill per dealt hand, visible in the label
  await waitFor(() => t.frame().table.handNumber === 3 && t.frame().turn.taking === P.Alice.playerID, { timeout: 40000, what: "hand 3 Alice's turn" });
  console.log("      hand 3 bank:", bank(), "label:", await label(P.Alice));
  assert(bank() >= 900 && bank() <= 1100, "1 s refilled: " + bank());
  assert(/Activate Extra Time \(1s\)/i.test(await label(P.Alice) ?? ""), "label (1s): " + await label(P.Alice));
  B.Alice.action("PLAYER_FOLD");
  await waitFor(() => t.frame().table.handNumber === 4, { timeout: 30000, what: "hand 4" });
  a = await t.turn(); assert(a.name === "Bob", "Bob first in hand 4"); a.action("PLAYER_CALL");
  await waitFor(() => t.frame().turn.taking === P.Alice.playerID, { timeout: 5000, what: "Alice's turn" });
  console.log("      hand 4 bank:", bank(), "label:", await label(P.Alice));
  assert(bank() >= 1900 && bank() <= 2100, "2 s after two refills: " + bank());
  assert(/Activate Extra Time \(2s\)/i.test(await label(P.Alice) ?? ""), "label (2s)");
  B.Alice.action("PLAYER_CHECK");
}
