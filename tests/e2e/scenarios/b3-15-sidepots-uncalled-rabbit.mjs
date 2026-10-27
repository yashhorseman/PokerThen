// B3-15: side pots + uncalled bet (3 stacks 100/300/600 all-in: `Uncalled bet of 300 returned to Alice`, main 300 / side 400 collect lines, main first) and
// rabbit hunting after a FLOP fold-win (REVEAL covers only the missing slots, requester-only log line `Undealt cards: <flop> [turn, river]`, others see
// `Some players are seeing the undealt cards.`) and after a PREFLOP fold-win (`Undealt cards:  [..5 cards..]` two spaces).
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, expectHas, assert, sleep, waitFor, seeText, text, click, clickBtn } from "../harness/b3.mjs";

const D1 = { pre: [0], deck: mkHand([["As", "Ad"], ["Ks", "Kd"], ["Qs", "Qd"]], ["2h", "7c", "9d", "Js", "3s"]) }; // dealer Alice: Bob, Carol, Alice
const D2 = { deck: mkHand([["Tc", "4d"], ["5c", "8h"], ["6c", "9h"]], ["Ah", "8c", "3d", "Jh", "Qc"]) }; // dealer Bob: Carol, Alice, Bob
const D3 = { deck: mkHand([["2s", "4s"], ["3c", "5h"], ["7s", "8s"]], ["Kh", "Qh", "Th", "9c", "6d"]) }; // dealer Carol: Alice, Bob, Carol
export const options = { decks: [D1, D2, D3] };
const combo = (s) => s.replace(/\(combination: [^)]+\)$/, "(combination: X)");
const slots = (p) => p.page.evaluate(() => ({ backs: document.querySelectorAll(".table-cards .card-container.hide, .table-cards .card-container.semi-hide").length, reveal: !!document.querySelector(".reveal-button"), revealW: document.querySelector(".reveal-button")?.getBoundingClientRect().width ?? 0 }));

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"], { stacks: [600, 100, 300], owner: 600, cfg: { rabbitHunt: true, showdownTime: "fast" } });
  const { P, B } = t;
  await t.start();
  await t.raise("Alice", 600); await t.call("Bob"); await t.call("Carol");
  await waitFor(() => t.frame().table.handNumber === 2, { timeout: 60000, what: "hand 2" });
  const l1 = norm(await t.log(1)); const i = l1.findIndex((x) => x.startsWith("Alice raises"));
  expectLog(l1.slice(i).map(combo), [
    "Alice raises to 600 and go all in", "Bob calls 100 and go all in", "Carol calls 300 and go all in",
    "Uncalled bet of 300 returned to Alice",
    "Alice shows a Q♠, Q♦.", "Bob shows a A♠, A♦.", "Carol shows a K♠, K♦.",
    "Flop:  [2♥, 7♣, 9♦]", "Turn: 2♥, 7♣, 9♦ [J♠]", "River: 2♥, 7♣, 9♦, J♠ [3♠]",
    "Bob collected 300 from pot with Pair, A's (combination: X)",
    "Carol collected 400 from pot with Pair, K's (combination: X)",
    "-- ending hand #1 --"
  ].map(combo), "side pot log");
  // hand 1 shows order: all-in reveal in SEAT order (research 06: yash, Carol, Dave = seat numbers) -> Alice(1), Bob(2), Carol(3)
  console.log("      shows order in the log:", l1.filter((x) => / shows a /.test(x)).join(" | "));
  // ---- hand 2: flop fold-win; folded Alice hunts the rabbit
  assert(t.stacks().Alice === 300 && t.stacks().Bob === 300 && t.stacks().Carol === 400, "stacks after hand 1 " + JSON.stringify(t.stacks()));
  await t.call("Bob"); await t.call("Carol"); await t.check("Alice");
  await sleep(1300);
  await t.raise("Carol", 20); await t.fold("Alice"); await t.fold("Bob");
  await waitFor(() => t.frame().result && t.frame().rabbit.enabled, { timeout: 10000, what: "result with rabbit" });
  await sleep(1500);
  const s2 = await slots(P.Alice); console.log("      rabbit slots Alice:", JSON.stringify(s2));
  assert(s2.reveal && s2.backs >= 2, "REVEAL bar + backs for the 2 missing streets: " + JSON.stringify(s2));
  await P.Alice.shoot("b3-15-rabbit-flop-before"); await P.Bob.shoot("b3-15-rabbit-flop-bob-before");
  await click(P.Alice, ".reveal-button");
  await seeText(P.Bob, /Some players are seeing the undealt cards\./, 4000);
  await seeText(P.Carol, /Some players are seeing the undealt cards\./, 4000);
  await sleep(900); await P.Alice.shoot("b3-15-rabbit-flop-after"); await P.Bob.shoot("b3-15-rabbit-flop-bob-after");
  assert((await slots(P.Bob)).reveal, "a non-requesting viewer keeps his own REVEAL bar");
  const la = norm(await t.log(2, "Alice")), lb = norm(await t.log(2, "Bob"));
  expectHas(la, "Undealt cards: A♥, 8♣, 3♦ [J♥, Q♣]", "requester log");
  assert(!lb.some((x) => /^Undealt cards/.test(x)), "other viewers' logs have no Undealt line (research 08 h)");
  expectHas(la, "Carol collected 60 from pot", "fold win");
  // ---- hand 3: preflop fold-win; the winner (Bob) hunts: five cards, two spaces
  await waitFor(() => t.frame().table.handNumber === 3, { timeout: 30000, what: "hand 3" });
  await t.fold("Carol"); await t.fold("Alice");
  await waitFor(() => t.frame().result && t.frame().rabbit.enabled, { timeout: 10000, what: "result 3" });
  await sleep(1200);
  const s3 = await slots(P.Bob); console.log("      rabbit slots preflop:", JSON.stringify(s3));
  assert(s3.reveal && s3.backs === 5, "5 backs preflop");
  await click(P.Bob, ".reveal-button"); await sleep(1200);
  expectHas(norm(await t.log(3, "Bob")), "Undealt cards:  [K♥, Q♥, 10♥, 9♣, 6♦]", "preflop rabbit line (two spaces)");
  await P.Bob.shoot("b3-15-rabbit-preflop-after");
}
