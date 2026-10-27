// INTEGRATION E7: decision limit 4 s + time bank 6 s. The acting client auto-sends ATB EXACTLY ONCE (W6 only), and the engine
// then auto-acts (fold facing a bet) after limit + bank. With the pref off the engine acts at the limit.
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { mkDeck } from "../harness/proto.mjs";
import { setupTable, clickBtn, whoseTurn, bodyText } from "../harness/ui.mjs";

export const options = { decks: [{ pre: [0], deck: mkDeck(["9c", "Qs", "Ac", "8d", "Qd", "Ad", "3c", "2h", "7h", "Js", "4c", "5d", "6s", "Kd"]) }] };

export default async function (h) {
  const alice = await h.player("Alice"); const bob = await h.player("Bob");
  await alice.page.evaluateOnNewDocument(() => { const W = window.WebSocket; window.__sent = []; const send = W.prototype.send; W.prototype.send = function (d) { try { window.__sent.push(String(d)); } catch {} return send.call(this, d); }; });
  const gid = await setupTable(h, alice, [[bob, 2, "Bob"]]);
  const cfg = (await alice.api("GET", `/games/${gid}/current_or_next_configs`)).json; delete cfg.queued;
  const up = await alice.api("POST", `/games/${gid}/update_game`, { ...cfg, decisionLimitSec: 4, timeBankSec: 6 });
  assert(up.status === 200, "config " + up.text);
  await clickBtn(alice, /start game/i);
  // heads-up: dealer (Alice, pre:[0]) is SB and acts first facing the BB
  const t = await whoseTurn([alice, bob]); assert(t === alice, "Alice acts first");
  const t0 = Date.now(); await sleep(1500); console.log("      sent (before the limit):", JSON.stringify(await alice.page.evaluate(() => window.__sent)));
  await waitFor(async () => (await alice.page.evaluate(() => window.__sent.filter((s) => s.includes('"ATB"')).length)) >= 1, { timeout: 10000, what: "auto ATB" });
  const atbAt = Date.now() - t0; console.log("      ATB sent after", atbAt, "ms");
  assert(atbAt >= 3500, "auto-activation waits for the decision limit (4 s), sent after " + atbAt);
  await alice.shoot("e7-1-extra-time");
  await waitFor(async () => !(await whoseTurn([alice, bob], 300).catch(() => null)) || (await whoseTurn([alice, bob], 300).catch(() => null)) !== alice, { timeout: 20000, what: "auto action" });
  const dt = Date.now() - t0;
  const n = await alice.page.evaluate(() => window.__sent.filter((s) => s.includes('"ATB"')).length);
  console.log("      auto action after", dt, "ms; ATB messages:", n);
  assert(n === 1, "ATB sent exactly once, got " + n);
  assert(dt >= 8500 && dt <= 14000, "engine waited limit+bank (~10 s +1.5 grace), got " + dt);
  const log = (await alice.api("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json.map((e) => e.msg);
  assert(log.some((m) => /Alice.* folds/.test(m)), "auto fold logged: " + log.slice(-6).join(" | "));
}
