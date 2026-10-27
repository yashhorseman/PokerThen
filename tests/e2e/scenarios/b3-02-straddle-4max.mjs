// B3-02: 4-handed UTG straddle (research 06 0b): log order SB, BB, straddle; first to act = left of the straddler (dealer here), straddler acts LAST with an option;
// button labels CALL 40 / CALL 30 / CALL 20; min raise 60 then 80 (previous raise increment).
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, assert, sleep, buttons } from "../harness/b3.mjs";

const D1 = { pre: [0], deck: mkHand([["2c", "7d"], ["3c", "8d"], ["Ks", "Kd"], ["4c", "9d"]], ["As", "Js", "5d"]) }; // deal order Bob, Carol, Dave, Alice
export const options = { decks: [D1] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol", "Dave"], { cfg: { straddleAllowed: true } });
  const { B, P } = t;
  B.Dave.action("SSP", { value: true }); await sleep(300);
  await t.start();
  const first = await t.turn();
  assert(first.name === "Alice", "first to act is left of the straddler (Alice, the dealer), got " + first.name);
  let fr = t.frame();
  assert(fr.hand.straddleId === P.Dave.playerID && fr.hand.highestBet === 40 && fr.hand.minRaise === 60, `straddle state: ${fr.hand.straddleId} ${fr.hand.highestBet} ${fr.hand.minRaise}`);
  await sleep(600);
  const lab = async (n) => (await buttons(P[n])).map((b) => b.text).join(" | ");
  assert(/^Call 40/i.test(await lab("Alice")), "Alice (dealer) CALL 40: " + await lab("Alice"));
  await P.Alice.shoot("b3-02-straddle-alice-to-act"); await P.Dave.shoot("b3-02-straddle-dave-waiting");
  await t.raise("Alice", 60);
  fr = t.frame();
  assert(fr.hand.minRaise === 80, "min re-raise after a raise to 60 = 80, got " + fr.hand.minRaise);
  await sleep(500);
  assert(/^Call 50/i.test(await lab("Bob")), "SB CALL 50 vs 60: " + await lab("Bob"));
  await t.fold("Bob");
  await sleep(500);
  assert(/^Call 40/i.test(await lab("Carol")), "BB CALL 40 vs 60: " + await lab("Carol"));
  await t.fold("Carol");
  await t.call("Dave"); // straddler acts last
  await sleep(900);
  const nt = await t.turn(); assert(nt.name === "Dave", "postflop first = Dave (first active left of the dealer), got " + nt.name);
  await t.check("Dave");
  await t.raise("Alice", 40);
  await t.fold("Dave");
  await t.result();
  const l = norm(await t.log(1));
  const i = l.findIndex((x) => x.startsWith("-- starting"));
  expectLog(l.slice(i), [
    "-- starting hand #1 (id: ID)  No Limit Texas Hold'em (dealer: Alice) --",
    "The player Alice joined the game with a stack of 1000.",
    "The player Bob joined the game with a stack of 1000.",
    "The player Carol joined the game with a stack of 1000.",
    "The player Dave joined the game with a stack of 1000.",
    "Player stacks: #1 Alice (1000) | #2 Bob (1000) | #3 Carol (1000) | #4 Dave (1000)",
    "Bob posts a small blind of 10",
    "Carol posts a big blind of 20",
    "Dave posts a straddle of 40",
    "Alice raises to 60",
    "Bob folds",
    "Carol folds",
    "Dave calls 60",
    "Flop:  [A♠, J♠, 5♦]",
    "Dave checks",
    "Alice bets 40",
    "Dave folds",
    "Uncalled bet of 40 returned to Alice",
    "Alice collected 150 from pot",
    "-- ending hand #1 --"
  ], "straddle hand log");
  await P.Alice.shoot("b3-02-straddle-end");
}
