// INTEGRATION E4: kill a client socket mid-hand (auto reconnect + state replay), then restart the server gracefully AND with SIGKILL mid-hand;
// every browser reconnects, the hand state survives and the hand can still be finished.
import { join } from "node:path";
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { mkDeck } from "../harness/proto.mjs";
import { setupTable, clickBtn, whoseTurn, act, bodyText } from "../harness/ui.mjs";

export const options = { allowConsoleErrors: true, decks: [{ pre: [2], deck: mkDeck(["As", "Kd", "2c", "7d", "9h", "3s", "4c", "Ah", "Kh", "Qh", "5c", "Jh", "6c", "Th"]) }] }; // dealer = Carol, so Alice (SB) acts first after the flop
const potText = (p) => p.page.evaluate(() => [document.querySelector(".table-pot-size")?.innerText, ...[...document.querySelectorAll(".table-player-stack")].map((e) => e.innerText.replace(/\s+/g, " ")).sort()].join("|"));

export default async function (h) {
  h.shotDir = join(h.shotDir, "../integration");
  const alice = await h.player("Alice"); const bob = await h.player("Bob"); const carol = await h.player("Carol", { phone: true });
  const all = [alice, bob, carol];
  // record every WebSocket the page creates so the test can kill the socket from outside the app
  for (const p of all) await p.page.evaluateOnNewDocument(() => { const W = window.WebSocket; window.__socks = []; window.WebSocket = function (...a) { const s = new W(...a); window.__socks.push(s); return s; }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); });
  await setupTable(h, alice, [[bob, 2, "Bob"], [carol, 3, "Carol"]]);
  await clickBtn(alice, /start game/i);
  let t = await whoseTurn(all); await act(t, "call");
  t = await whoseTurn(all); await act(t, "call");
  t = await whoseTurn(all); await act(t, "check");
  await sleep(1500);
  // ---- 1. kill Bob's socket (server-side TCP stays; client sees close) while the others act
  const before = await potText(alice);
  await bob.page.evaluate(() => window.__socks.forEach((s) => s.close()));
  await sleep(300);
  t = await whoseTurn(all); assert(t === alice, "Alice acts first on the flop");
  await act(t, "raise 60");
  await waitFor(async () => (await potText(bob)) === (await potText(alice)), { timeout: 15000, what: "Bob table replays to the same state after reconnect: " + (await potText(bob)) + " vs " + (await potText(alice)) });
  await bob.shoot("e4-1-after-socket-kill");
  assert(bob.page.url().includes("/games/"), "still on the table");
  // ---- 2. graceful restart mid-hand
  const pre = await potText(alice);
  await h.restartServer({ crash: false });
  for (const p of all) await waitFor(async () => (await potText(p)) === pre, { timeout: 30000, what: p.name + " reconnected after graceful restart" });
  await alice.shoot("e4-2-after-restart-alice"); await carol.shoot("e4-2-after-restart-carol");
  // ---- 3. SIGKILL restart mid-hand
  await h.restartServer({ crash: true });
  for (const p of all) await waitFor(async () => (await potText(p)) === pre, { timeout: 30000, what: p.name + " reconnected after SIGKILL restart" });
  // ---- 4. hand is still playable: finish it
  t = await whoseTurn(all, 20000);
  await act(t, "fold"); t = await whoseTurn(all, 20000); await act(t, "fold");
  await sleep(1500);
  const logText = (await alice.api("GET", `/api/games/${alice.gameID}/log_v3?hand_number=1`)).json.map((e) => e.msg).join("\n");
  assert(/Hand commitment/.test(logText), "commitment line survived");
  assert(!/(.+)\n\1\n/.test(logText), "no duplicated log lines after restarts");
  console.log("      pot/stacks before kill:", before, "after:", pre);
}
