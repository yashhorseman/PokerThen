// B3-07: owner tools through the real UI: Edit Player (SET immediate / ADD queued mid-hand + toasts + log lines), pause/resume text, stop confirm + log line,
// Remove Player (confirm + toast + `enqueued the removal` + `quits` lines), Transfer Ownership (confirm + toast; no log line: U-LOG1), remove mid-hand (queued).
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, expectHas, assert, sleep, seeText, text, waitFor, idle, openEditFor, confirmOverlay, click, clickBtn, dismissAlert } from "../harness/b3.mjs";

export const options = { allowConsoleErrors: true, decks: [{ pre: [0], deck: mkHand([["2c", "7d"], ["3c", "8d"], ["4c", "9d"]]) }] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"], { cfg: { autoDeal: false } });
  const { P } = t;
  const setStack = async (name, mode, v) => {
    await openEditFor(P.Alice, name);
    await clickBtn(P.Alice, new RegExp("^" + mode + "$", "i"), ".config-edit-player .choose-buttons button");
    await P.Alice.page.click(".config-edit-player input[placeholder]", { clickCount: 3 }); await P.Alice.page.keyboard.type(String(v));
    await clickBtn(P.Alice, /^update/i, ".pt-submit");
    return dismissAlert(P.Alice);
  };
  const back = async () => { for (let i = 0; i < 2; i++) { await P.Alice.page.keyboard.press("Escape"); await sleep(400); } };
  // 1. waiting table: immediate
  assert(await setStack("Bob", "SET", 1500) === "Player successfully updated!", "immediate toast");
  await P.Alice.shoot("b3-07-edit-player");
  await back();
  assert(t.stack("Bob") === 1500, "Bob 1500 at once");
  await t.start();
  // 2. mid-hand ADD => queued
  const q = await setStack("Bob", "ADD", 100);
  assert(q === "The player will be updated on next hand.", "queued toast: " + q);
  await back();
  assert(t.stack("Bob") !== 1600 && /^(14|15)/.test(String(t.stack("Bob"))), "stack unchanged mid-hand: " + t.stack("Bob"));
  // pause / resume (guests see the paused text), stop confirm + log
  await click(P.Alice, ".top-right-button.pause"); await seeText(P.Bob, /The room owner paused the game\./, 4000);
  await P.Bob.shoot("b3-07-paused-guest");
  await click(P.Alice, ".top-right-button.pause"); await waitFor(async () => !/paused the game/.test(await text(P.Bob)), { timeout: 4000, what: "resumed" });
  await click(P.Alice, ".top-right-button.stop");
  const sc = await confirmOverlay(P.Alice, true);
  assert(/You are about to stop the game\. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven\./.test(sc), "stop confirm text: " + sc);
  await sleep(500); assert(await P.Alice.page.$(".top-right-button.stop.red"), "stop armed");
  await click(P.Alice, ".top-right-button.stop"); await sleep(500); // click again = cancel the stop (title Cancel Game Stop)
  assert(!(await P.Alice.page.$(".top-right-button.stop.red")), "stop cancelled");
  await t.fold("Alice"); await t.fold("Bob");
  await idle(t, 30000);
  // 3. next hand applies the queued ADD
  t.B.Alice.action("NH"); await t.turn(10000);
  const l2 = norm(await t.log(2));
  console.log("      hand 2 head:", l2.slice(0, 4).join(" || "));
  expectLog(l2.slice(0, 2), ["The admin updated the player Bob stack from 1490 to 1590.", l2[1]], "queued stack applied before the start line");
  const l1 = norm(await t.log(1));
  expectHas(l1, "The admin updated the player Bob stack from 1000 to 1500.");
  expectHas(l1, "WARNING: the admin queued the stack change for the player Bob adding 100 chips in the next hand.");
  expectHas(l1, "The admin Alice enqueued the game stop on next hand.");
  assert(!l1.some((x) => /pause|resume/i.test(x)), "no log line for pause/resume (research 08 g)");
  await t.fold("Bob"); await t.fold("Carol");
  await idle(t, 30000);
  // 4. remove Carol between hands
  await openEditFor(P.Alice, "Carol");
  await clickBtn(P.Alice, /^remove player/i, ".pt-btn");
  assert(/Are you sure that you want to remove this player from their seat\?/.test(await confirmOverlay(P.Alice, true)), "remove confirm");
  assert(await dismissAlert(P.Alice) === "Player successfully removed.", "removed toast");
  await P.Alice.shoot("b3-07-removed"); await back();
  const l3 = norm(await t.log(3));
  console.log("      hand 3 head:", l3.slice(0, 4).join(" || "));
  expectLog(l3.slice(0, 2), ["The admin Alice enqueued the removal of the player Carol.", "The player Carol quits the game with a stack of 1000."].map((x) => x), "remove log");
  assert(!t.frame().seats.some(([, id]) => id === P.Carol.playerID), "Carol's seat is empty");
  // 5. transfer ownership to Bob
  await openEditFor(P.Alice, "Bob");
  await clickBtn(P.Alice, /^transfer game ownership/i, ".pt-btn");
  assert(/Are you sure that you want transfer the game ownership\?/.test(await confirmOverlay(P.Alice, true)), "transfer confirm");
  assert(await dismissAlert(P.Alice) === "Game ownership successfully transferred.", "transfer toast");
  await seeText(P.Bob, /OWNER: BOB/i, 4000); await seeText(P.Alice, /OWNER: BOB/i, 4000);
  await P.Bob.shoot("b3-07-bob-owner");
  assert((await P.Alice.api("POST", `/games/${t.gid}/update_game`, {})).status === 403, "old owner can no longer update the game");
  assert(await P.Bob.page.$(".top-right-button.pause"), "new owner sees the owner buttons");
  // 6. new owner presses Next Hand (UI), removes Alice mid-hand (queued), she auto-folds, quits at hand end
  await clickBtn(P.Bob, /next hand/i, "button, .button-1", 15000);
  await t.turn(10000);
  const rm = await P.Bob.api("POST", `/games/${t.gid}/remove_player`, { playerID: P.Alice.playerID });
  assert(rm.status === 200 && rm.json.queued === true, "remove mid-hand is queued: " + rm.text);
  await waitFor(() => t.frame().result || t.frame().table.status === "waiting", { timeout: 15000, what: "Alice auto-folds => Bob wins" });
  await waitFor(() => t.frame().table.status === "waiting", { timeout: 30000, what: "table waits for others after Alice leaves" });
  await seeText(P.Bob, /Waiting for others/i, 4000);
  const l3b = norm(await t.log(3));
  console.log("      hand 3:", l3b.join(" || "));
  expectHas(l3b, "The admin Bob enqueued the removal of the player Alice.");
  expectHas(l3b, "Alice folds");
  const l4 = norm(await t.log(4));
  assert(l4.some((x) => /^The player Alice quits the game with a stack of \d+\.$/.test(x)), "Alice quits at hand end: " + l4.join(" | "));
  const r5 = (await P.Bob.api("GET", `/games/${t.gid}/players_sessions`)); assert(r5.status === 200, "ledger readable");
}
