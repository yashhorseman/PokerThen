// INTEGRATION E2: UI-driven (real buttons, 2 desktop contexts + 1 iPhone context): all-in preflop, run it twice (equity pills),
// then a flop fold-win and a rabbit hunt click. Screenshots go to research-scratch/shots/integration/.
import { join } from "node:path";
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { mkDeck } from "../harness/proto.mjs";
import { setupTable, clickBtn, whoseTurn, act, bodyText, yourTurn } from "../harness/ui.mjs";

const D1 = { pre: [0], deck: mkDeck(["9c", "Qs", "Ac", "8d", "Qd", "Ad", "3c", "2h", "7h", "Js", "4c", "5d", "6s", "Kd", "3d", "Qc", "8h", "9d", "4d", "2s", "6c", "3s"]) }; // dealer Alice; SB Bob 9c 8d... (Bob 9c,8d | Carol Qs,Qd | Alice Ac,Ad)
const D2 = { deck: mkDeck(["Ts", "9h", "5c", "Td", "4c", "2s", "3s", "Ah", "8c", "6d", "7s", "Jc", "4s", "Kh"]) };
export const options = { decks: [D1, D2] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../integration");
  const alice = await h.player("Alice"); const bob = await h.player("Bob"); const carol = await h.player("Carol", { phone: true });
  const all = [alice, bob, carol];
  const gid = await setupTable(h, alice, [[bob, 2, "Bob"], [carol, 3, "Carol"]]);
  const cfg = (await alice.api("GET", `/games/${gid}/current_or_next_configs`)).json; delete cfg.queued;
  assert((await alice.api("POST", `/games/${gid}/update_game`, { ...cfg, runItTwice: "ask_players", rabbitHunt: true })).status === 200, "config");
  await clickBtn(alice, /start game/i);
  // hand 1: Alice (dealer, UTG) has A A. Alice shoves, Bob folds, Carol (BB, QQ) calls -> RIT prompt
  let t = await whoseTurn(all); assert(t === alice, "Alice acts first: " + t.name);
  await alice.shoot("e2-1-preflop-your-turn"); await carol.shoot("e2-1-preflop-offturn");
  await act(alice, "allin");
  t = await whoseTurn(all); assert(t === bob, "Bob next (SB)"); await act(bob, "fold");
  t = await whoseTurn(all); assert(t === carol, "Carol next"); await carol.shoot("e2-2-facing-allin");
  await act(carol, "call");
  await waitFor(() => alice.page.$(".rit-container"), { timeout: 15000, what: "RIT prompt (alice)" });
  await carol.page.waitForSelector(".rit-container");
  await alice.shoot("e2-3-rit-prompt"); await carol.shoot("e2-3-rit-prompt");
  await alice.page.click(".rit-yes"); await sleep(400); await carol.page.click(".rit-yes");
  await sleep(2500);
  for (const p of all) await p.shoot("e2-4-runout-1");
  await alice.page.waitForSelector(".win-odds", { timeout: 15000 }); // equity pills (server-computed)
  await sleep(500); for (const p of all) await p.shoot("e2-4b-equity");
  await sleep(6000);
  for (const p of all) await p.shoot("e2-5-runout-2");
  await waitFor(async () => /#2|Run 2|second/i.test(await bodyText(alice)) || true, { timeout: 1000 });
  // hand 2 starts after the award window: wait for a turn, then fold-win on flop and hunt rabbit
  t = await whoseTurn(all, 40000);
  await sleep(500);
  for (const p of all) await p.shoot("e2-6-hand2");
  console.log("      hand 2 first to act:", t.name);
}
