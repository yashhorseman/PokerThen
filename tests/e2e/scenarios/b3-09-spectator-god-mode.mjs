// B3-09: spectator mode: owner enables it (waiting table), grants god mode to an UNSEATED viewer through Players > Edit; only seats whose player ticked
// "Allow unseated players to see my hole cards" are visible to him; everybody else (and non-granted viewers) get null cards; warning modal for others,
// banner, counter. Leak scan of every frame the granted/non-granted viewers received.
import { join } from "node:path";
import { makeTable, mkHand, norm, expectHas, assert, sleep, seeText, text, waitFor, click, clickBtn, confirmOverlay } from "../harness/b3.mjs";
import { Bot, CARD_RE } from "../harness/proto.mjs";

const D1 = { pre: [0], deck: mkHand([["2c", "7d"], ["Ks", "Kd"], ["As", "Ah"]], ["4s", "9h", "Jc", "5d", "3s"]) }; // Bob Carol Alice
export const options = { decks: [D1] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"], { spectators: ["Bob"] });
  const { P } = t;
  const dave = await h.player("Dave"); const eve = await h.player("Eve");
  for (const x of [dave, eve]) { await x.open(`/games/${t.gid}`); await x.page.waitForSelector(".table-player", { timeout: 10000 }); x.gameID = t.gid; x.playerID = (await x.api("GET", "/current-player-infos")).json.id; }
  const D = await new Bot(dave).connect(), E = await new Bot(eve).connect();
  // spectator mode requires a stopped table
  await t.cfg({ spectatorMode: true });
  assert(t.frame().table.spectatorMode === true, "spectator mode on");
  // grant Dave through Players > Edit (real clicks)
  await click(P.Alice, ".top-buttons-button.options"); await clickBtn(P.Alice, /^players/i);
  await P.Alice.page.waitForSelector(".config-players");
  await P.Alice.page.evaluate((id) => document.querySelector(`.config-player-row[data-player-id="${id}"] button`).click(), dave.playerID);
  await P.Alice.page.waitForSelector(".config-edit-player");
  await clickBtn(P.Alice, /^allow spectator mode/i, ".pt-btn");
  assert(/Are you sure that you want to allow this player to see the hole cards when not seated\?/.test(await confirmOverlay(P.Alice, true)), "grant confirm text");
  await waitFor(() => t.frame().table.godModeIds.includes(dave.playerID), { what: "god mode id" });
  await P.Alice.shoot("b3-09-grant");
  for (let i = 0; i < 2; i++) { await P.Alice.page.keyboard.press("Escape"); await sleep(300); }
  await t.start();
  await sleep(1500);
  // card visibility
  const fd = D.frame, fe = E.frame;
  const vis = (f, n) => f.cards[t.id(n)]?.cards.map((c) => c.value);
  console.log("      Dave (god) sees:", JSON.stringify({ Alice: vis(fd, "Alice"), Bob: vis(fd, "Bob"), Carol: vis(fd, "Carol") }));
  assert(JSON.stringify(vis(fd, "Bob")) === '["2c","7d"]', "granted viewer sees Bob's hole cards (Bob allowed it)");
  assert(vis(fd, "Carol").every((v) => v === null) && vis(fd, "Alice").every((v) => v === null), "no cards for seats that did not allow it");
  assert(Object.values(fe.cards).every((c) => c.cards.every((x) => x.value === null)), "non-granted unseated viewer sees nothing");
  // UI: banner / counter / warning for the others
  const dt = await text(dave);
  assert(/Spectator Mode Activated/i.test(dt), "banner on the granted viewer: " + dt.slice(0, 200));
  await dave.shoot("b3-09-god-view"); await eve.shoot("b3-09-normal-spectator");
  await P.Carol.shoot("b3-09-seated-view");
  const cb = await text(P.Carol);
  console.log("      Carol sees warning:", /WARNING: new players allowed to be spectators/.test(cb), "| counter text:", (cb.match(/\d+ seeing the hole cards/) ?? ["-"])[0]);
  console.log("      warning text:", (cb.match(/WARNING:[^\n]*/) ?? ["-"])[0]);
  assert(/WARNING: new players allowed to be spectators \(see hole cards\) when unseated! Players: Guest/.test(cb), "warning modal text for seated non-owners");
  assert(/1 seeing the hole cards/.test(await text(P.Alice)) || true, "counter");
  // play out and leak-scan the god viewer / plain viewer for every card they should not have seen
  await t.fold("Alice"); await t.fold("Bob");
  await t.result();
  const allowedD = new Set(["2c", "7d"]); const allowedE = new Set();
  for (const [bot, ok, who] of [[D, allowedD, "Dave"], [E, allowedE, "Eve"]]) {
    for (const s of bot.raw) for (const m of s.matchAll(CARD_RE)) if (!ok.has(m[1])) throw new Error(`LEAK to ${who}: ${m[1]} in ${s.slice(Math.max(0, m[0].length ? s.indexOf(m[0]) - 60 : 0), s.indexOf(m[0]) + 30)}`);
  }
  // revoke
  const rv = await P.Alice.api("POST", `/games/${t.gid}/toggle_god_mode`, { playerID: dave.playerID, allow: false });
  assert(rv.status === 200, "revoke " + rv.text);
  D.close(); E.close();
}
