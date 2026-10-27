// INTEGRATION E8: pause/unpause, away / I'm back, leave seat (confirm dialog, check/fold until hand end), stop game on next hand, sound cycle.
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { setupTable, clickBtn, whoseTurn, act, bodyText } from "../harness/ui.mjs";

const click = (p, sel) => p.page.evaluate((s) => document.querySelector(s).click(), sel);
const confirmOverlay = async (p, ok = true) => {
  await p.page.waitForSelector(".pt-overlay-scrim .alert-1");
  const btns = await p.page.$$(".pt-overlay-scrim .alert-1-buttons .button-1");
  await (ok ? btns[btns.length - 1] : btns[0]).click();
};

export default async function (h) {
  const alice = await h.player("Alice"); const bob = await h.player("Bob"); const carol = await h.player("Carol", { phone: true });
  const all = [alice, bob, carol];
  const gid = await setupTable(h, alice, [[bob, 2, "Bob"], [carol, 3, "Carol"]]);
  await clickBtn(alice, /start game/i); await sleep(1200);
  // pause
  await click(alice, ".top-right-button.pause"); await sleep(900);
  await alice.shoot("e8-1-paused"); await bob.shoot("e8-1-paused-guest");
  assert(/paused/i.test(await bodyText(bob)), "guests see the paused text: " + (await bodyText(bob)).slice(0, 200));
  await click(alice, ".top-right-button.pause"); await sleep(900);
  assert(!/game is paused|paused by/i.test(await bodyText(bob)), "unpaused");
  // away / back (Bob, not acting yet or acting; use the button)
  await click(bob, ".top-buttons-button.away"); await sleep(900);
  await alice.shoot("e8-2-bob-away");
  assert(/Away/i.test(await alice.page.$$eval(".table-player", (els) => els.map((e) => e.innerText).join("|"))), "Bob shows away to others");
  await click(bob, ".top-buttons-button.away"); await sleep(700);
  // leave seat: Carol on phone
  await click(carol, ".top-buttons-button.leave-seat"); await confirmOverlay(carol, true); await sleep(800);
  await carol.shoot("e8-3-carol-leaving");
  // stop game on next hand (owner)
  await click(alice, ".top-right-button.stop"); await confirmOverlay(alice, true); await sleep(600);
  await alice.shoot("e8-4-stop-queued");
  assert(await alice.page.$(".top-right-button.stop.red"), "stop armed (red)");
  // sound cycle
  const cls0 = await alice.page.$eval(".top-right-button.sound", (e) => e.className); await click(alice, ".top-right-button.sound");
  assert((await alice.page.$eval(".top-right-button.sound", (e) => e.className)) !== cls0, "sound button cycles");
  // finish the hand: remaining players check/call; quitting players are auto check/fold
  const stopped = async () => /START GAME|Waiting for/i.test(await bodyText(alice)) && !(await alice.page.$(".table-player-bet-value"));
  for (let i = 0; i < 30 && !(await stopped()); i++) {
    const t = await whoseTurn(all, 3000).catch(() => null);
    if (!t) { await sleep(1000); continue; }
    const labels = await t.page.evaluate(() => [...document.querySelectorAll(".action-button:not([disabled])")].map((b) => b.textContent.trim().toLowerCase()));
    await act(t, labels.includes("check") ? "check" : labels.some((l) => l.startsWith("call")) ? "call" : "fold").catch(() => {});
  }
  await sleep(2500);
  await alice.shoot("e8-5-after-stop"); await carol.shoot("e8-5-after-stop-carol");
  const fin = await bodyText(alice);
  console.log("      after stop:", fin.replace(/\n+/g, " | ").slice(0, 260));
  const f = (await alice.api("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json.map((e) => e.msg);
  console.log("      hand 1 tail:", f.slice(-6).join(" || "));
  assert(/START GAME/i.test(fin), "game stopped after the hand (Start Game is offered again)");
  assert(!/Carol/.test(await alice.page.$$eval(".table-player:not(.empty)", (els) => els.map((e) => e.innerText).join("|"))), "Carol left her seat");
}
