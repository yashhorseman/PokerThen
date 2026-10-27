// B3-08: Game Configurations through the real UI. Waiting table: `Update Game` + `Game successfully updated.`; running game: `Update on Next Hand`
// + enqueue toast + banner; Allow Straddle and Showdown Speed apply to the running hand AT ONCE (logged at once), the rest at the next hand start
// (`Game Config Changes` block just before `-- starting hand`), research 08 i.
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, expectHas, assert, sleep, seeText, text, waitFor, idle, click, clickBtn, dismissAlert } from "../harness/b3.mjs";

export const options = { decks: [{ pre: [0], deck: mkHand([["2c", "7d"], ["3c", "8d"], ["4c", "9d"]]) }] };

async function openConfig(p) {
  await clickBtn(p, /got it/i, "button", 800).catch(() => {});
  await click(p, ".top-buttons-button.options");
  await clickBtn(p, /game configurations/i);
  await p.page.waitForSelector(".pt-game-settings");
  await sleep(500);
}
/** click a Yes/No choice or type a number in the field whose label starts with `label` */
async function setField(p, label, value) {
  const ok = await p.page.evaluate((l, v) => {
    const f = [...document.querySelectorAll(".pt-field")].find((e) => (e.innerText || "").trim().toLowerCase().startsWith(l.toLowerCase()));
    if (!f) return false;
    const btn = [...f.querySelectorAll(".choose-buttons button")].find((b) => b.textContent.trim().toLowerCase().startsWith(String(v).toLowerCase()));
    if (btn) { btn.click(); return true; }
    const sel = f.querySelector("select"); if (sel) { sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); return "select"; }
    return "num";
  }, label, value);
  if (ok === "num") {
    await p.page.evaluate((l, v) => {
      const i = [...document.querySelectorAll(".pt-field")].find((e) => (e.innerText || "").trim().toLowerCase().startsWith(l.toLowerCase())).querySelector("input");
      i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, String(v)); i.dispatchEvent(new Event("input", { bubbles: true }));
    }, label, value);
  } else assert(ok, "field not found: " + label);
}

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"]);
  const { P } = t;
  // ---- waiting table: immediate
  await openConfig(P.Alice);
  await setField(P.Alice, "Allow players to see the undealt cards", "Yes");
  const lab0 = await P.Alice.page.$eval(".pt-submit", (e) => e.textContent.trim());
  assert(/^update game$/i.test(lab0), "waiting label: " + lab0);
  await click(P.Alice, ".pt-submit");
  assert(await dismissAlert(P.Alice) === "Game successfully updated.", "waiting toast");
  assert(t.frame().table.config.rabbitHunt === true && t.frame().table.configQueued === false, "applied at once");
  await P.Alice.page.keyboard.press("Escape"); await sleep(400);
  await t.start();
  // ---- running: queued
  await openConfig(P.Alice);
  await setField(P.Alice, "Allow players to see the undealt cards", "No");
  await setField(P.Alice, "Allow UTG Straddle", "Yes");
  await setField(P.Alice, "Showdown Presentation Time", "fast");
  await setField(P.Alice, "Decision Time Limit", "30");
  const lab1 = await P.Alice.page.$eval(".pt-submit", (e) => e.textContent.trim());
  assert(/^update on next hand$/i.test(lab1), "running label: " + lab1);
  await click(P.Alice, ".pt-submit");
  assert(await dismissAlert(P.Alice) === "New configs successfully enqueued. The game will be updated on the next hand.", "enqueue toast");
  await sleep(500);
  const fr = t.frame();
  assert(fr.table.configQueued === true, "configQueued flag");
  assert(fr.table.config.straddleAllowed === true && fr.table.config.showdownTime === "fast", "straddle + showdown speed apply at once: " + JSON.stringify([fr.table.config.straddleAllowed, fr.table.config.showdownTime]));
  assert(fr.table.config.rabbitHunt === true && fr.table.config.decisionLimitSec === 20, "other fields still old: " + JSON.stringify([fr.table.config.rabbitHunt, fr.table.config.decisionLimitSec]));
  await P.Alice.page.keyboard.press("Escape"); await sleep(300);
  await openConfig(P.Alice);
  assert(/These settings are waiting the next hand to be defined\./.test(await text(P.Alice)), "banner");
  const shown = await P.Alice.page.$$eval(".pt-field", (fs) => fs.find((f) => /Decision Time Limit/i.test(f.innerText)).querySelector("input").value);
  console.log("      form shows decision limit:", shown, "; GET current_or_next_configs:", (await P.Alice.api("GET", `/games/${t.gid}/current_or_next_configs`)).text.slice(0, 400));
  assert(shown === "30", "form shows the queued value: " + shown);
  await P.Alice.shoot("b3-08-config-queued");
  await P.Alice.page.keyboard.press("Escape"); await sleep(300);
  const l1 = norm(await t.log(1));
  expectHas(l1, "Game Config Changes\n* Rabbit Hunt: off » on");
  expectHas(l1, "Game Config Changes\n* Allow Straddle: off » on\n* Showdown Speed: Normal » Fast");
  assert(!l1.some((x) => /Decision Limit Time/.test(x)), "queued fields not logged yet");
  await t.fold("Alice"); await t.fold("Bob");
  await waitFor(() => t.frame().table.handNumber === 2, { timeout: 20000, what: "hand 2" });
  const l2 = norm(await t.log(2));
  expectLog(l2.slice(0, 2), ["Game Config Changes\n* Rabbit Hunt: on » off\n* Decision Limit Time: 20s » 30s", l2[1]], "queued block before the start line");
  assert(l2[1].startsWith("-- starting hand #2"), "start line follows");
  assert(t.frame().table.config.decisionLimitSec === 30 && t.frame().table.configQueued === false, "applied at hand start");
  // non-owner: read-only (no submit button)
  await openConfig(P.Bob);
  assert(!(await P.Bob.page.$(".pt-submit")) && /only the room owner can change/i.test(await text(P.Bob)), "guest read-only");
}
