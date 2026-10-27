// INTEGRATION E6: Auto start OFF. Between hands the owner sees the Next Hand button (result !== null && nextStep === null) and others see the waiting text;
// config is queued while a hand runs (banner), applied next hand.
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { setupTable, clickBtn, whoseTurn, act, bodyText } from "../harness/ui.mjs";

export default async function (h) {
  const alice = await h.player("Alice"); const bob = await h.player("Bob");
  const gid = await setupTable(h, alice, [[bob, 2, "Bob"]]);
  const cfg = (await alice.api("GET", `/games/${gid}/current_or_next_configs`)).json; delete cfg.queued;
  assert((await alice.api("POST", `/games/${gid}/update_game`, { ...cfg, autoDeal: false })).status === 200, "autoDeal off");
  await clickBtn(alice, /start game/i);
  let t = await whoseTurn([alice, bob]); await act(t, "fold");
  await sleep(4500);
  await alice.shoot("e6-1-owner-between-hands"); await bob.shoot("e6-1-guest-between-hands");
  const a = await bodyText(alice), b = await bodyText(bob);
  assert(/next hand/i.test(a), "owner sees Next Hand: " + a.slice(0, 300));
  assert(!/next hand/i.test(b.replace(/waiting[^\n]*next hand[^\n]*/i, "")) || /waiting|owner/i.test(b), "guest sees a waiting message");
  // queued config while a hand is running
  await clickBtn(alice, /next hand/i);
  await waitFor(() => whoseTurn([alice, bob], 500).catch(() => null), { timeout: 8000, what: "hand 2 turn" });
  const r = await alice.api("POST", `/games/${gid}/update_game`, { ...cfg, autoDeal: false, rabbitHunt: true });
  assert(r.status === 200 && r.json.queued === true, "mid-hand config is queued: " + r.text);
  await sleep(600); await alice.shoot("e6-2-queued-banner");
  await alice.page.click(".top-buttons-button.options"); await clickBtn(alice, /game configurations/i); await sleep(600);
  await alice.shoot("e6-3-config-queued");
  assert(/waiting the next hand/i.test(await bodyText(alice)), "queued banner text in the Game configuration screen");
}
