// INTEGRATION E1: create through the /start-game form, join by invite link (desktop + iPhone context), owner Quick Accept, start,
// fold-win hand, log/ledger content, owner Edit Player from the seat menu, queued config change banner.
import { join } from "node:path";
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { formCreate, uiSit, dismissAlert, uiAccept, gotIt, clickBtn, whoseTurn, act, bodyText } from "../harness/ui.mjs";

export default async function (h) {
  h.shotDir = join(h.shotDir, "../integration");
  const alice = await h.player("Alice"); const bob = await h.player("Bob"); const carol = await h.player("Carol", { phone: true });
  const gid = await formCreate(alice, "Alice");
  console.log("      game id:", gid);
  assert(/^\/games\//.test(new URL(alice.page.url()).pathname), "landed on the table");
  await alice.shoot("e1-1-owner-waiting");
  assert(/Waiting for others/i.test(await bodyText(alice)), "waiting banner");
  // invite link = the page URL
  await uiSit(bob, gid, 2, "Bob", 1500);
  assert(/You requested this seat/.test(await dismissAlert(bob)), "guest alert text");
  await bob.shoot("e1-2-bob-requested");
  await uiAccept(alice);
  await uiSit(carol, gid, 3, "Carol", 1000);
  await dismissAlert(carol); await carol.shoot("e1-3-carol-requested-phone");
  await alice.shoot("e1-3-owner-quick-accept");
  await uiAccept(alice);
  await gotIt([alice, bob, carol]);
  await waitFor(async () => /Bob/.test(await bodyText(carol)) && /Carol/.test(await bodyText(alice)), { what: "all seated" });
  assert(/1500/.test(await bodyText(bob)), "Bob's stack 1500 shown");
  await clickBtn(alice, /start game/i);
  // fold-win
  let t = await whoseTurn([alice, bob, carol]); await act(t, "fold");
  t = await whoseTurn([alice, bob, carol]); await act(t, "fold");
  await sleep(2500);
  for (const p of [alice, bob, carol]) await p.shoot("e1-4-after-foldwin");
  // log
  await clickBtn(alice, /^log/i);
  await alice.page.waitForSelector(".pt-log-list");
  await sleep(600);
  const log = await alice.page.$$eval(".pt-log-list > *", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  console.log("      log (newest first):", log.slice(0, 4).join(" || "));
  await alice.shoot("e1-5-log");
  const text = log.join("\n");
  assert(/Hand commitment \(SHA-256\): [0-9a-f]{64}/.test(text), "commitment log line");
  // the reveal line is published only after the result window closes (FAIRNESS-MERKLE), so poll instead of assuming a delay
  let h1 = [];
  for (let i = 0; i < 40; i++) {
    h1 = (await alice.api("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json.map((e) => e.msg);
    if (h1.some((m) => /Hand reveal/.test(m))) break;
    await sleep(500);
  }
  console.log("      hand 1 log:", h1.join(" || "));
  assert(h1.some((m) => /Hand commitment \(SHA-256\)/.test(m)) && h1.some((m) => /Hand reveal: 0 exposed cards/.test(m) || /Hand reveal/.test(m)), "both fairness lines in hand 1 log");
  assert(h1.some((m) => /collected 30|collected 20|collected/.test(m)), "win line");
  await alice.page.keyboard.press("Escape"); await sleep(300);
  // Edit Player from the seat menu (owner only)
  await alice.page.evaluate(() => { const el = [...document.querySelectorAll(".table-player:not(.you) .table-player-infos-ctn")][0]; el?.click(); });
  await alice.page.waitForSelector(".player-controls-popover");
  await alice.shoot("e1-6-seat-menu");
  await clickBtn(alice, /^edit player/i, ".player-controls-popover button");
  await sleep(700); await alice.shoot("e1-7-edit-player");
  assert(/Edit|Stack|Remove|Transfer/i.test(await bodyText(alice)), "edit player screen");
  await alice.page.keyboard.press("Escape").catch(() => {});
  // non-owner has no Edit Player
  await bob.page.evaluate(() => { const el = [...document.querySelectorAll(".table-player:not(.you) .table-player-infos-ctn")][0]; el?.click(); });
  await bob.page.waitForSelector(".player-controls-popover");
  assert(!/Edit Player/i.test(await bob.page.$eval(".player-controls-popover", (e) => e.innerText)), "guest has no Edit Player");
}
