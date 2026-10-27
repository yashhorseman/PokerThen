// B3-03: antes (research 08 f): queued blind-schedule change logs `Game Config Changes` + `The game's ante was changed from 0 to 5.` at hand start, then
// `X posts an ante of 5` for every player in seat order BEFORE the blinds; header (A:5); pot 15 / total 45; antes are dead money (call 20, min raise 40).
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, assert, sleep, buttons, seeText, text, soft } from "../harness/b3.mjs";

const D1 = { pre: [0], deck: mkHand([["2c", "7d"], ["3c", "8d"], ["4c", "9d"]], []) };
const D2 = { deck: mkHand([["Ks", "Kd"], ["Qs", "Qd"], ["Js", "Jd"]], ["2h", "5s", "9c"]) }; // dealer Bob: deal order Carol, Alice, Bob
export const options = { decks: [D1, D2] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"]);
  const { P } = t;
  await t.start();
  // hand 1 running: queue the ante schedule (running game => queued)
  await t.cfg({ antes: true, blindLevels: [{ sb: 10, bb: 20, ante: 5, durationMin: null }], blindResetLevel: 1 }, true);
  await t.fold("Alice"); await t.fold("Bob");
  await t.result();
  // between hand 1's end and hand 2: the queued change is NOT yet applied/logged
  const l1 = norm(await t.log(1));
  assert(!l1.some((x) => /Game Config Changes/.test(x)), "queued config is not logged during hand 1: " + l1.join(" | "));
  await sleep(100);
  const first = await t.turn(30000);
  assert(first.name === "Bob", "Bob (dealer, UTG 3-handed) acts first, got " + first.name);
  await sleep(700);
  const body = await text(P.Alice);
  console.log("      header text:", JSON.stringify((await P.Alice.page.evaluate(() => document.querySelector(".game-infos")?.innerText ?? "")).replace(/\n+/g, " | ")));
  assert(/\(A:\s?5\)/.test(body), "header shows the ante: " + body.slice(0, 300));
  assert(/\(A:5\)/.test(body), "header reads (A:5) with no space (research 08 f2.png)");
  const fr = t.frame();
  assert(fr.hand.minRaise === 40 && fr.hand.highestBet === 20, `min raise 40 (antes are not part of it), highest 20: ${fr.hand.minRaise} ${fr.hand.highestBet}`);
  assert(fr.hand.pot === 15, "pot 15 (antes) before bets: " + fr.hand.pot);
  assert(/\b15\b/.test(await P.Alice.page.evaluate(() => document.querySelector(".table-pot-size")?.innerText ?? body)) && /total\s*45/.test(body), "pot display 15 / total 45");
  assert((await buttons(P.Bob)).some((b) => /^call 20$/i.test(b.text)), "CALL 20 (antes are dead): " + JSON.stringify(await buttons(P.Bob)));
  for (const n of ["Alice", "Bob", "Carol"]) await P[n].shoot("b3-03-antes-preflop");
  await t.call("Bob"); await t.call("Carol"); await t.check("Alice");
  await sleep(900);
  await t.raise("Carol", 20); await t.fold("Alice"); await t.fold("Bob");
  await t.result();
  const l2 = norm(await t.log(2));
  expectLog(l2, [
    "Game Config Changes\n* Blind Schedule: L1: 10/20 » L1: 10/20 - ante 5\n* Restart Blind Schedule at Level: none » 1",
    "The game's ante was changed from 0 to 5.",
    "-- starting hand #2 (id: ID)  No Limit Texas Hold'em (dealer: Bob) --",
    "Player stacks: #1 Alice (1000) | #2 Bob (990) | #3 Carol (1010)",
    "Alice posts an ante of 5", "Bob posts an ante of 5", "Carol posts an ante of 5",
    "Carol posts a small blind of 10", "Alice posts a big blind of 20",
    "Bob calls 20", "Carol calls 20", "Alice checks",
    "Flop:  [2♥, 5♠, 9♣]",
    "Carol bets 20", "Alice folds", "Bob folds",
    "Uncalled bet of 20 returned to Carol",
    "Carol collected 75 from pot",
    "-- ending hand #2 --"
  ], "ante hand log");
}
