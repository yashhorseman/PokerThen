// B3-16: (1) the create form asks the host for a starting stack (owner-approved difference from the reference): chosen stack is used, an invalid one is refused with the seat-form message;
// (2) the host leaving and sitting down again takes the seat DIRECTLY (SPEC 2.3 `Take the Seat`: no approval dialog for their own request), while a guest still needs approval.
import { join } from "node:path";
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { uiSit, dismissAlert, uiAccept, gotIt, bodyText } from "../harness/ui.mjs";

const typeInto = async (p, sel, val) => { await p.page.click(sel, { clickCount: 3 }); await p.page.keyboard.press("Backspace"); if (val) await p.page.keyboard.type(val); };
const confirmOverlay = async (p) => {
  await p.page.waitForSelector(".pt-overlay-scrim .alert-1");
  const btns = await p.page.$$(".pt-overlay-scrim .alert-1-buttons .button-1");
  await btns[btns.length - 1].click();
};

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  // (1a) invalid stacks are refused on the create form
  const bad = await h.player("BadStack");
  await bad.open("/start-game");
  await bad.page.waitForSelector("#pt-stack");
  await bad.shoot("b3-16-create-form");
  await typeInto(bad, "#pt-nick", "Zed");
  for (const v of ["0", "abc", "", "1000001"]) {
    await typeInto(bad, "#pt-stack", v);
    await bad.page.click(".pt-create-btn");
    await waitFor(async () => /must be a value between 1 and 1\.000\.000/.test(await bodyText(bad)), { what: "stack error for " + JSON.stringify(v), timeout: 4000 });
    assert(bad.page.url().includes("/start-game"), "stays on the form for stack " + JSON.stringify(v));
  }
  // (1b) a chosen stack is used
  const alice = await h.player("Alice");
  await alice.open("/start-game");
  await alice.page.waitForSelector("#pt-stack");
  assert((await alice.page.$eval("#pt-stack", (e) => e.value)) === "1000", "stack field is prefilled with 1000");
  await typeInto(alice, "#pt-nick", "Alice");
  await typeInto(alice, "#pt-stack", "750");
  await alice.page.click(".pt-create-btn");
  await alice.page.waitForFunction(() => /\/games\//.test(location.pathname), { timeout: 10000 });
  const gid = alice.page.url().split("/games/")[1];
  await alice.page.waitForSelector(".table-player", { timeout: 10000 });
  await gotIt([alice]);
  await waitFor(async () => /750/.test(await bodyText(alice)), { what: "owner stack 750 on the table" });

  // (2) the host leaves the seat and sits down again: seated directly, no approval dialog
  await alice.page.evaluate(() => document.querySelector(".top-buttons-button.leave-seat").click());
  await confirmOverlay(alice);
  await waitFor(() => alice.page.$(".table-player.empty"), { what: "empty seats after leaving" });
  await uiSit(alice, gid, 4, "Alice", 300);
  await sleep(1500);
  assert(!(await alice.page.$(".quick-accept")), "no approval dialog for the host's own seat");
  assert(!(await alice.page.$(".pt-overlay-scrim .alert-1")), "no 'requested this seat' alert for the host");
  const body = await bodyText(alice);
  assert(/300/.test(body) && /Alice/.test(body), "host is seated with the typed stack 300: " + body.slice(0, 200));
  await alice.shoot("b3-16-host-resat");

  // a guest still needs the host's approval
  const bob = await h.player("Bob");
  await uiSit(bob, gid, 2, "Bob", 500);
  assert(/You requested this seat/.test(await dismissAlert(bob)), "guest alert");
  await uiAccept(alice);
  await sleep(500);
  await waitFor(async () => /Bob/.test(await bodyText(alice)), { what: "Bob seated after approval" });
}
