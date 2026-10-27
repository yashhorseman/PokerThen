// B3-04: leave mid-hand (QUITTING, auto fold, quits line at hand end), away mid-hand (auto check, `stand up` line), dead button header,
// `Dead Small Blind`, I'M BACK -> IN NEXT HAND, `joined` line and `posts a missing small blind of 10` (research 06 0b, 07, 08).
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, assert, sleep, seeText, text, waitFor } from "../harness/b3.mjs";

const D1 = { pre: [0], deck: mkHand([["2c", "7d"], ["3c", "8d"], ["4c", "9d"], ["5c", "Td"], ["6c", "Jd"]]) }; // Bob Carol Dave Eve Alice
const D2 = { deck: mkHand([["Kc", "Kd"], ["Qc", "Qd"], ["Ac", "Ad"]], ["2h", "5s", "9c"]) }; // Dave Eve Alice
const D3 = { deck: mkHand([["3s", "4s"], ["5h", "6h"], ["7s", "8s"], ["9s", "Ts"]]) };
export const options = { decks: [D1, D2, D3] };

const click = (p, sel) => p.page.evaluate((s) => document.querySelector(s).click(), sel);
const confirmOverlay = async (p, ok = true) => {
  await p.page.waitForSelector(".pt-overlay-scrim .alert-1");
  const btns = await p.page.$$(".pt-overlay-scrim .alert-1-buttons .button-1");
  await (ok ? btns[btns.length - 1] : btns[0]).click();
};

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol", "Dave", "Eve"]);
  const { P } = t;
  await t.start();
  // Bob (SB) leaves his seat mid-hand, Carol (BB) goes away -- both through the real buttons
  await click(P.Bob, ".top-buttons-button.leave-seat"); await confirmOverlay(P.Bob, true);
  await click(P.Carol, ".top-buttons-button.away"); await sleep(700);
  const body = await text(P.Alice);
  assert(/QUITTING/i.test(body), "Bob's seat shows QUITTING: " + body.slice(0, 200));
  assert(/AWAY/i.test(body), "Carol's seat shows AWAY");
  await P.Alice.shoot("b3-04-quitting-away");
  await t.fold("Dave"); await t.fold("Eve"); await t.fold("Alice"); // Bob auto-folds, Carol (BB) takes the blinds
  await t.result();
  const l1 = norm(await t.log(1));
  const i1 = l1.findIndex((x) => x.startsWith("-- starting"));
  expectLog(l1.slice(i1), [
    "-- starting hand #1 (id: ID)  No Limit Texas Hold'em (dealer: Alice) --",
    "The player Alice joined the game with a stack of 1000.", "The player Bob joined the game with a stack of 1000.", "The player Carol joined the game with a stack of 1000.",
    "The player Dave joined the game with a stack of 1000.", "The player Eve joined the game with a stack of 1000.",
    "Player stacks: #1 Alice (1000) | #2 Bob (1000) | #3 Carol (1000) | #4 Dave (1000) | #5 Eve (1000)",
    "Bob posts a small blind of 10", "Carol posts a big blind of 20",
    "Dave folds", "Eve folds", "Alice folds", "Bob folds",
    "Uncalled bet of 10 returned to Carol", "Carol collected 20 from pot",
    "The player Carol stand up with the stack of 1010.",
    "-- ending hand #1 --"
  ], "hand 1 log");
  // hand 2 (auto start): Bob's seat (the button seat) is empty => dead button; Carol's seat holds an away player => Dead Small Blind
  await waitFor(() => t.frame().table.handNumber === 2, { timeout: 20000, what: "hand 2" });
  await t.turn();
  const f2 = t.frame();
  assert(f2.hand.deadButton === true && f2.hand.bigBlindId === P.Dave.playerID && f2.hand.smallBlindId === null, "dead button, BB Dave, no SB: " + JSON.stringify([f2.hand.deadButton, f2.hand.bigBlindId, f2.hand.smallBlindId]));
  await sleep(500);
  await P.Alice.shoot("b3-04-dead-button-hand2");
  assert(/AWAY/i.test(await text(P.Alice)), "Carol still shown away");
  await click(P.Carol, ".top-buttons-button.away"); await sleep(600); // I'M BACK
  await seeText(P.Alice, /IN NEXT HAND/i, 4000);
  await P.Alice.shoot("b3-04-carol-in-next-hand");
  await t.call("Eve"); await t.call("Alice"); await t.check("Dave");
  await sleep(900);
  await t.raise("Dave", 20); await t.fold("Eve"); await t.fold("Alice");
  await t.result();
  const l2 = norm(await t.log(2));
  expectLog(l2, [
    "The player Bob quits the game with a stack of 990.",
    "-- starting hand #2 (id: ID)  No Limit Texas Hold'em (dead button) --",
    "Player stacks: #1 Alice (1000) | #4 Dave (1000) | #5 Eve (1000)",
    "Dead Small Blind",
    "Dave posts a big blind of 20",
    "Eve calls 20", "Alice calls 20", "Dave checks",
    "Flop:  [2♥, 5♠, 9♣]",
    "Dave bets 20", "Eve folds", "Alice folds",
    "Uncalled bet of 20 returned to Dave",
    "Dave collected 60 from pot",
    "-- ending hand #2 --"
  ], "hand 2 (dead button) log");
  // hand 3: button lands on Carol (returning player): joined line + missing small blind
  await waitFor(() => t.frame().table.handNumber === 3, { timeout: 20000, what: "hand 3" });
  await t.fold("Alice"); await t.fold("Carol"); await t.fold("Dave");
  await t.result();
  const l3 = norm(await t.log(3));
  const i3 = l3.findIndex((x) => x.startsWith("-- starting"));
  expectLog(l3.slice(i3), [
    "-- starting hand #3 (id: ID)  No Limit Texas Hold'em (dealer: Carol) --",
    "The player Carol joined the game with a stack of 1010.",
    "Player stacks: #1 Alice (980) | #3 Carol (1010) | #4 Dave (1040) | #5 Eve (980)",
    "Carol posts a missing small blind of 10",
    "Dave posts a small blind of 10", "Eve posts a big blind of 20",
    "Alice folds", "Carol folds", "Dave folds",
    "Uncalled bet of 10 returned to Eve", "Eve collected 30 from pot",
    "-- ending hand #3 --"
  ], "hand 3 (missing blind) log");
}
