// UI-driven helpers (INTEGRATION): everything here clicks real DOM like a user would.
import { sleep, waitFor } from "./index.mjs";

/** Guest: open the invite link, click the empty seat `seatNo`, fill the Request popover, submit. */
export async function uiSit(p, gameID, seatNo, nick, stack = 1000) {
  await p.open(`/games/${gameID}`);
  await p.page.waitForSelector(".table-player.empty", { timeout: 10000 });
  await clickBtn(p, /got it/i, "button", 1200).catch(() => {}); // the TOS bar sits above the lower seats' popovers
  const ok = await p.page.evaluate((n) => {
    for (const e of document.querySelectorAll(".table-player.empty")) {
      if (e.querySelector(".table-player-seat-position-number")?.textContent?.trim() === String(n)) { e.querySelector(".table-player-seat").click(); return true; }
    }
    return false;
  }, seatNo);
  if (!ok) throw new Error("empty seat not found " + seatNo);
  await p.page.waitForSelector(".request-ingress-popover input", { timeout: 5000 });
  await sleep(150);
  const fill = async (idx, val) => {
    for (let i = 0; i < 5; i++) {
      try {
        const el = (await p.page.$$(".request-ingress-popover input[type=text]"))[idx];
        await el.click({ clickCount: 3 }); await p.page.keyboard.type(val); return;
      } catch (e) { if (i === 4) throw e; await sleep(200); }
    }
  };
  await fill(0, nick); await fill(1, String(stack));
  await p.page.click(".request-ingress-popover .pt-sit-submit");
}
export async function dismissAlert(p, timeout = 4000) {
  const btn = await waitFor(() => p.page.$(".pt-overlay-scrim .alert-1-buttons .button-1"), { timeout, what: "alert" });
  const text = await p.page.$eval(".pt-overlay-scrim .alert-1-message", (e) => e.textContent);
  await btn.click();
  return text;
}
/** Owner: accept the Quick Accept dialog for the next waiting request. */
export async function uiAccept(owner, timeout = 8000) {
  await owner.page.waitForSelector(".quick-accept", { timeout });
  await sleep(100);
  await owner.page.evaluate(() => [...document.querySelectorAll(".quick-accept .button-1")].find((b) => /accept/i.test(b.textContent) && !/ignore/i.test(b.textContent)).click());
  await dismissAlert(owner).catch(() => {});
}
export async function clickBtn(p, re, selector = "button, .button-1", timeout = 6000) {
  const h = await waitFor(async () => {
    for (const e of await p.page.$$(selector)) {
      const t = await e.evaluate((x) => (x.offsetParent !== null ? (x.textContent ?? "").trim() : null));
      if (t && re.test(t)) return e;
    }
    return null;
  }, { timeout, what: `button ${re}` });
  await h.click();
}
export const bodyText = (p) => p.page.evaluate(() => document.body.innerText);

export const yourTurn = (p) => p.page.evaluate(() => !!document.querySelector(".action-signal.your-turn"));
/** which of `players` currently has the action (polls until one does) */
export async function whoseTurn(players, timeout = 15000) {
  return waitFor(async () => { for (const p of players) if (await yourTurn(p)) return p; return null; }, { timeout, what: "someone's turn" });
}
/** act via real buttons: "fold" | "check" | "call" | "raise N" | "allin" */
export async function act(p, spec) {
  const [verb, amt] = spec.split(/\s+/);
  const re = { fold: /^fold/i, check: /^check$/i, call: /^(call|all in)/i, raise: /^(raise|bet)/i, allin: /^(raise|bet|all)/i }[verb];
  await clickBtn(p, re, ".action-button");
  if (verb === "raise" || verb === "allin") {
    await p.page.waitForSelector("#pt-bet-input", { timeout: 4000 });
    if (verb === "allin") {
      await clickBtn(p, /^all/i, ".default-bet-button");
    } else {
      await p.page.click("#pt-bet-input", { clickCount: 3 }); await p.page.keyboard.type(String(amt));
    }
    await sleep(100);
    await p.page.click(".raise-action-buttons input[type=submit]");
  }
  await sleep(850); // W4 750 ms double-click lock
}
export async function gotIt(players) { for (const p of players) await clickBtn(p, /got it/i, "button", 1500).catch(() => {}); }
/** create table with owner + joiners entirely through the UI. `seats` = [[player, seatNo, nick, stack]] */
export async function setupTable(h, owner, seats) {
  const gid = await owner.createTable(owner.name);
  for (const [p, seat, nick, stack] of seats) {
    await uiSit(p, gid, seat, nick, stack ?? 1000);
    await dismissAlert(p);
    await uiAccept(owner);
    await sleep(300);
  }
  await gotIt([owner, ...seats.map((s) => s[0])]);
  return gid;
}

/** owner creates the table through the real /start-game form; returns gameID (taken from the URL after the router swap) */
export async function formCreate(p, nick) {
  await p.open("/start-game");
  await p.page.waitForSelector("#pt-nick");
  await p.page.type("#pt-nick", nick);
  await p.page.click(".pt-create-btn");
  await p.page.waitForFunction(() => /\/games\//.test(location.pathname), { timeout: 10000 });
  p.gameID = p.page.url().split("/games/")[1];
  await p.page.waitForSelector(".table-player", { timeout: 10000 });
  p.playerID = (await p.api("GET", "/current-player-infos")).json?.id;
  return p.gameID;
}
