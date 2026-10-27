// B3-06: rebuy flow (research 08 d): busted player's prompt `Would you like to Rebuy?` (20 s), centre texts for the others, owner approval dialog with a
// different stack, stack added BEFORE the next `Player stacks:` line, `The player Bob rebought. New stack 500.`, owner CANCEL => `quits ... stack of 0`,
// and an unanswered prompt times out after 20 s with the same `quits` line.
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, expectHas, assert, sleep, seeText, text, waitFor, idle } from "../harness/b3.mjs";
import { clickBtn } from "../harness/ui.mjs";

const D1 = { pre: [0], deck: mkHand([["2c", "7d"], ["3c", "8d"], ["Ac", "Ad"]], ["4s", "9h", "Jc", "5d", "Ks"]) }; // Bob Carol Alice
const D2 = { deck: mkHand([["3d", "8h"], ["Kc", "Kd"], ["Qs", "Qh"]], ["2h", "5s", "9c", "3h", "4d"]) }; // dealer Bob: Carol Alice Bob
const D3 = { deck: mkHand([["Ah", "Ad"], ["7s", "2s"]], ["3c", "9d", "Jh", "4h", "Td"]) }; // dealer Carol, heads-up: Alice Carol
export const options = { decks: [D1, D2, D3] };

const nextHand = (p) => clickBtn(p, /next hand/i, "button, .button-1", 30000);

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"], { stacks: [1000, 100, 1000], cfg: { allowRebuy: true, autoDeal: false } });
  const { P } = t;
  await t.start();
  await t.raise("Alice", 100); await t.call("Bob"); await t.fold("Carol");
  await idle(t, 40000);
  assert(t.stack("Bob") === 0, "Bob busted but keeps the seat (rebuy allowed)");
  await seeText(P.Bob, /Waiting for the owner to deal the next hand/i, 4000);
  await nextHand(P.Alice);
  await seeText(P.Carol, /Waiting for busted players to make rebuy decision\.\s*\((19|20) seconds\)/i, 4000);
  await P.Bob.page.waitForSelector(".pt-rebuy #pt-rebuy-stack", { timeout: 4000 });
  const dlg = await P.Bob.page.$eval(".pt-rebuy", (e) => e.innerText.replace(/\s+/g, " "));
  console.log("      Bob dialog:", dlg);
  assert(/Would you like to Rebuy\?/.test(dlg) && /(19|20) seconds to take the decision/.test(dlg), "prompt text + 20 s: " + dlg);
  assert(!(await P.Carol.page.$(".pt-rebuy")) && !(await P.Alice.page.$(".pt-rebuy")), "only the busted player gets the modal");
  await P.Bob.shoot("b3-06-rebuy-prompt-bob"); await P.Carol.shoot("b3-06-rebuy-wait-carol");
  await P.Bob.page.click("#pt-rebuy-stack"); await P.Bob.page.keyboard.type("1000");
  await clickBtn(P.Bob, /^confirm/i, ".pt-rebuy button");
  await P.Alice.page.waitForSelector(".pt-rebuy #pt-rebuy-approve", { timeout: 5000 });
  const od = await P.Alice.page.$eval(".pt-rebuy", (e) => e.innerText.replace(/\s+/g, " "));
  console.log("      owner dialog:", od);
  assert(/The player "Bob" requested a rebuy\./.test(od) && /Requested stack: 1000/.test(od), "owner dialog text");
  await seeText(P.Bob, /Waiting for the owner to approve\/deny the pending rebuys\. \(\d+ seconds\)/i, 3000);
  await P.Alice.shoot("b3-06-rebuy-owner-approval");
  await P.Alice.page.click("#pt-rebuy-approve", { clickCount: 3 }); await P.Alice.page.keyboard.type("500");
  await clickBtn(P.Alice, /^approve/i, ".pt-rebuy button");
  await waitFor(() => t.frame().table.handNumber === 2, { timeout: 8000, what: "hand 2 starts right after approval" });
  const l2 = norm(await t.log(2));
  console.log("      hand 2 head:", l2.slice(0, 7).join(" || "));
  const i = l2.findIndex((x) => x.startsWith("-- starting"));
  expectLog(l2.slice(0, i + 2), [
    "Asking to busted players the rebuy decision.",
    "The player Bob requested a rebuy of 1000.",
    "The player Bob rebought. New stack 500.",
    "-- starting hand #2 (id: ID)  No Limit Texas Hold'em (dealer: Bob) --",
    "Player stacks: #1 Alice (1120) | #2 Bob (500) | #3 Carol (980)"
  ].map((x) => x), "rebuy log order (stack before Player stacks)");
  // hand 2: Bob (UTG/dealer) shoves 500, Alice calls and wins -> busted again; owner DENIES this time
  await t.raise("Bob", 500); await t.fold("Carol"); await t.call("Alice");
  await idle(t, 40000);
  assert(t.stack("Bob") === 0, "Bob busted again");
  await nextHand(P.Alice);
  await P.Bob.page.waitForSelector(".pt-rebuy #pt-rebuy-stack", { timeout: 4000 });
  await P.Bob.page.click("#pt-rebuy-stack", { clickCount: 3 }); await P.Bob.page.keyboard.type("800");
  await clickBtn(P.Bob, /^confirm/i, ".pt-rebuy button");
  await P.Alice.page.waitForSelector(".pt-rebuy #pt-rebuy-approve", { timeout: 5000 }); // dialog reopens for the same player (fixed)
  await clickBtn(P.Alice, /^cancel/i, ".pt-rebuy button");
  await waitFor(() => t.frame().table.handNumber === 3, { timeout: 8000, what: "hand 3 (heads-up) starts" });
  const l3 = norm(await t.log(3));
  expectLog(l3.slice(0, 4), [
    "Asking to busted players the rebuy decision.",
    "The player Bob requested a rebuy of 800.",
    "The player Bob quits the game with a stack of 0.",
    l3[3]
  ], "deny log");
  assert(l3[3].startsWith("-- starting hand #3"), "hand 3 header follows: " + l3[3]);
  assert(!t.frame().seats.some(([, id]) => id === P.Bob.playerID), "Bob lost his seat");
  // hand 3 heads-up: Carol (dealer/SB) shoves, Alice calls and wins; Carol never answers the rebuy prompt => 20 s timeout => quits
  const nt = await t.turn(); assert(nt.name === "Carol", "dealer Carol acts first heads-up");
  const cs = t.stack("Carol") + (t.frame().hand.bets[P.Carol.playerID] || 0);
  await t.raise("Carol", cs); await t.call("Alice");
  await idle(t, 40000);
  await nextHand(P.Alice);
  await P.Carol.page.waitForSelector(".pt-rebuy #pt-rebuy-stack", { timeout: 4000 });
  const t0 = Date.now();
  await waitFor(() => t.frame().table.handNumber === 4 || t.frame().table.status === "waiting", { timeout: 30000, what: "prompt timeout" });
  const dt = Date.now() - t0; console.log("      unanswered prompt ended after", dt, "ms");
  assert(dt > 17000 && dt < 24000, "20 s window, got " + dt);
  const l4 = norm(await t.log(4));
  expectHas(l4, "The player Carol quits the game with a stack of 0.", "timeout quits line");
  expectLog(l4.slice(0, 2), ["Asking to busted players the rebuy decision.", "The player Carol quits the game with a stack of 0."], "timeout log");
  await P.Alice.shoot("b3-06-after-timeout");
  assert(/Waiting for others/i.test(await text(P.Alice)), "table back to waiting for others");
}
