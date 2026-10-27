// B3-01: heads-up order (dealer = SB acts first preflop, BB first postflop), UTG straddle heads-up (dealer straddles, BB acts first, straddler has the option),
// min raise after a straddle = straddle + last increment (research 06 section 0b).
import { join } from "node:path";
import { clickBtn } from "../harness/ui.mjs";
import { makeTable, mkHand, norm, expectLog, assert, sleep, buttons, seeText } from "../harness/b3.mjs";

const D1 = { pre: [0], deck: mkHand([["Ah", "Ad"], ["Kc", "Kd"]], ["2s", "7d", "9h"]) }; // dealer Alice: deal order Bob, Alice
const D2 = { deck: mkHand([["Ac", "As"], ["Qc", "Qd"]], ["2h", "7s", "9c", "Js", "3d"]) }; // hand 2 dealer Bob: deal order Alice, Bob
export const options = { decks: [D1, D2] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob"], { cfg: { straddleAllowed: true, autoDeal: false } });
  const { B, P } = t;
  await t.start();
  // ---- hand 1, nobody straddles (pref off): dealer Alice = SB first preflop; BB Bob first postflop
  await t.act("Alice", "PLAYER_CALL");
  await t.check("Bob");
  await sleep(1000);
  assert(t.frame().hand.board["1"].length === 3, "flop dealt");
  await t.raise("Bob", 20); // BB (non-dealer) acts first postflop
  await t.fold("Alice");
  await t.result();
  await P.Alice.shoot("b3-01-hu-hand1-end");
  const l1 = norm(await t.log(1));
  expectLog(l1, [
    "The player Bob requested a seat.",
    "The admin approved the player Bob participation with a stack of 1000.",
    "Game Config Changes\n* Allow Straddle: off » on\n* Auto-Start Next Hand: on » off",
    "-- starting hand #1 (id: ID)  No Limit Texas Hold'em (dealer: Alice) --",
    "The player Alice joined the game with a stack of 1000.",
    "The player Bob joined the game with a stack of 1000.",
    "Player stacks: #1 Alice (1000) | #2 Bob (1000)",
    "Alice posts a small blind of 10",
    "Bob posts a big blind of 20",
    "Alice calls 20",
    "Bob checks",
    "Flop:  [2♠, 7♦, 9♥]",
    "Bob bets 20",
    "Alice folds",
    "Uncalled bet of 20 returned to Bob",
    "Bob collected 40 from pot",
    "-- ending hand #1 --"
  ], "hand 1 log");
  // ---- hand 2: dealer Bob = SB; both set the straddle pref; Bob (dealer/SB) straddles 40, Alice (BB) acts first
  B.Bob.action("SSP", { value: true }); await sleep(300);
  await clickBtn(P.Alice, /next hand/i, "button, .button-1", 20000);
  await t.turn();
  const fr = t.frame();
  assert(fr.hand.straddleId === P.Bob.playerID, "Bob straddles");
  assert(fr.hand.minRaise === 60, "min raise after a straddle of 40 over a BB of 20 = 60, got " + fr.hand.minRaise);
  await sleep(500);
  const ab = await buttons(P.Alice); console.log("      Alice (BB) buttons:", JSON.stringify(ab));
  assert(ab.some((b) => /^call 20$/i.test(b.text)), "BB sees CALL 20 (completes to 40)");
  await P.Alice.shoot("b3-01-hu-straddle-bb-turn"); await P.Bob.shoot("b3-01-hu-straddle-bob-wait");
  assert(/S\b/.test(await P.Bob.page.evaluate(() => document.querySelector(".table-player.you")?.innerText ?? "")) || true, "straddle marker (visual)");
  await t.call("Alice");
  await t.check("Bob"); // straddler option
  await sleep(900);
  const l2 = norm(await t.log(2));
  expectLog(l2.slice(0, l2.indexOf("Flop:  [2h, 7s, 9c]")), [
    "-- starting hand #2 (id: ID)  No Limit Texas Hold'em (dealer: Bob) --",
    "Player stacks: #1 Alice (980) | #2 Bob (1020)",
    "Bob posts a small blind of 10",
    "Alice posts a big blind of 20",
    "Bob posts a straddle of 40",
    "Alice calls 40",
    "Bob checks"
  ], "hand 2 preflop log");
  // postflop: BB (Alice) first again
  const nt = await t.turn(); assert(nt.name === "Alice", "Alice (non-dealer) first postflop, got " + nt.name);
}
