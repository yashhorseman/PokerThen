// B3-05: short all-in does not reopen betting for players who already acted (Raise disabled, CALL 60) but the min raise for players who
// have NOT acted uses the short shove's increment (research 08 c: 160 + 60 = 220; after a full raise to 220 -> 280). Also queued owner stack SET lines.
import { join } from "node:path";
import { makeTable, mkHand, norm, expectHas, assert, sleep, buttons, idle, text } from "../harness/b3.mjs";

const D1 = { pre: [0], deck: mkHand([["Qc", "Qd"], ["As", "Ah"], ["Kc", "Kd"]], ["2h", "7c", "Js", "3d", "9s"]) }; // Bob Carol Alice
const D2 = { deck: mkHand([["Tc", "Td"], ["Ac", "Ad"], ["2s", "3s"]], ["2h", "7c", "Js", "4d", "9s"]) }; // dealer Bob: Carol Alice Bob
export const options = { decks: [D1, D2] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"], { stacks: [1000, 1000, 180], cfg: { autoDeal: false } });
  const { P } = t;
  await t.start();
  await t.call("Alice"); await t.call("Bob"); await t.check("Carol");
  await sleep(900);
  await t.raise("Bob", 100);
  await t.raise("Carol", 160); // 60 more than the 100 bet: NOT a full raise
  let fr = t.frame();
  assert(fr.hand.minRaise === 220, "min raise for a player who has not acted = 160 + 60 = 220, got " + fr.hand.minRaise);
  assert(!fr.hand.noReraiseIds.includes(P.Alice.playerID) && fr.hand.noReraiseIds.includes(P.Bob.playerID), "noReraise = [Bob]: " + JSON.stringify(fr.hand.noReraiseIds));
  await sleep(1300);
  const ab = await buttons(P.Alice);
  assert(ab.some((b) => /^call 160$/i.test(b.text)) && ab.some((b) => /^raise$/i.test(b.text) && !b.disabled), "Alice: CALL 160 + RAISE enabled " + JSON.stringify(ab));
  await P.Alice.shoot("b3-05-alice-can-raise");
  await t.call("Alice");
  await sleep(1300);
  const bb = await buttons(P.Bob);
  console.log("      Bob buttons after the short shove:", JSON.stringify(bb));
  assert(bb.some((b) => /^call 60$/i.test(b.text) && !b.disabled), "Bob: CALL 60");
  assert(bb.some((b) => /^raise$/i.test(b.text) && b.disabled), "Bob: RAISE disabled (no reopen)");
  assert(bb.some((b) => /^check$/i.test(b.text) && b.disabled), "Bob: CHECK disabled");
  await P.Bob.shoot("b3-05-bob-raise-disabled");
  await t.call("Bob");
  await sleep(1000); await t.check("Bob"); await t.check("Alice"); // turn
  await sleep(1000); await t.check("Bob"); await t.check("Alice"); // river
  await idle(t, 40000);
  let l1 = norm(await t.log(1));
  expectHas(l1, "Bob bets 100"); expectHas(l1, "Carol raises to 160 and go all in"); expectHas(l1, "Alice calls 160"); expectHas(l1, "Bob calls 160");
  console.log("      hand 1 tail:", l1.slice(-6).join(" || "));
  assert(l1.some((x) => /^Carol collected 540 from pot with Pair, A's \(combination: .*\)$/.test(x)), "Carol wins 540 with Pair, A's");
  // hand 2: owner queues SET 180 for Alice while idle (queued: the hand state is inProgress)
  const a = await P.Alice.api("POST", `/games/${t.gid}/update_player`, { playerID: P.Alice.playerID, stackChange: 180, stackChangeMode: "SET" });
  assert(a.status === 200 && a.json.queued === true, "queued SET: " + a.text);
  t.B.Alice.action("NH");
  await t.turn(15000);
  assert(t.frame().hand.dealerId === P.Bob.playerID, "dealer Bob");
  await t.call("Bob"); await t.call("Carol"); await t.check("Alice");
  await sleep(900);
  await t.raise("Carol", 100);
  await t.raise("Alice", 160); // short all-in (+60)
  await t.raise("Bob", 220);   // Bob had not acted: min raise 220, full raise
  fr = t.frame();
  assert(fr.hand.minRaise === 280, "after the full raise to 220 the min raise is 280, got " + fr.hand.minRaise);
  assert(fr.hand.noReraiseIds.length === 0, "full raise reopens for everyone: " + JSON.stringify(fr.hand.noReraiseIds));
  await sleep(1300);
  const cb = await buttons(P.Carol);
  assert(cb.some((b) => /^call 120$/i.test(b.text)) && cb.some((b) => /^raise$/i.test(b.text) && !b.disabled), "Carol: CALL 120 + RAISE enabled: " + JSON.stringify(cb));
  await P.Carol.shoot("b3-05-carol-reopened");
  await t.fold("Carol");

  await idle(t, 60000);
  const l2 = norm(await t.log(2));
  console.log("      hand 2:", l2.join(" || "));
  expectHas(l2, "WARNING: the admin queued the stack change for the player Alice reseting to 180 chips in the next hand.".replace("WARNING", "WARNING"), "queued line (hand 2 pre-start log)") ;
}
