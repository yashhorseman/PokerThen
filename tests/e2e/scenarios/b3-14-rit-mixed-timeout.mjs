// B3-14: run it twice with a decliner (research 08: `Bob chooses to not run it twice.` then at once `Some players choose to not run it twice.`, single run) and
// with nobody answering (10 s window, then only `Some players choose to not run it twice.`).
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, assert, sleep, waitFor, seeText, text } from "../harness/b3.mjs";

const D1 = { pre: [0], deck: mkHand([["As", "Ad"], ["Kc", "Kd"]], ["2h", "7c", "9d", "Js", "3s"]) }; // dealer Alice: Bob, Alice
const D2 = { deck: mkHand([["Qc", "Qd"], ["2c", "3d"]], ["4h", "8c", "9s", "Jc", "5d"]) }; // dealer Bob: Alice, Bob
export const options = { decks: [D1, D2] };
const combo = (s) => s.replace(/\(combination: [^)]+\)$/, "(combination: X)");

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob"], { stacks: [1000, 300], cfg: { runItTwice: "ask_players", showdownTime: "fast" } });
  const { P, B } = t;
  await t.start();
  await t.raise("Alice", 300); await t.call("Bob");
  await waitFor(() => t.frame().turn.ritWaiting, { timeout: 8000, what: "RIT prompt" });
  B.Alice.action("DRITD", { decision: true }); await sleep(300); B.Bob.action("DRITD", { decision: false });
  await waitFor(() => t.frame().table.handNumber === 2, { timeout: 60000, what: "hand 2" });
  const l1 = norm(await t.log(1)); const i = l1.indexOf("Remaining players decide whether to run it twice.");
  expectLog(l1.slice(i).map(combo), [
    "Remaining players decide whether to run it twice.",
    "Alice chooses to  run it twice.", "Bob chooses to not run it twice.", "Some players choose to not run it twice.",
    "Alice shows a K♣, K♦.", "Bob shows a A♠, A♦.",
    "Flop:  [2♥, 7♣, 9♦]", "Turn: 2♥, 7♣, 9♦ [J♠]", "River: 2♥, 7♣, 9♦, J♠ [3♠]",
    "Bob collected 600 from pot with Pair, A's (combination: X)",
    "-- ending hand #1 --"
  ], "mixed vote log");
  assert(t.frame().hand.runs === 1, "single run");
  // hand 2: Bob (dealer/SB) shoves 600, Alice calls, NOBODY votes
  await t.raise("Bob", 600); await t.call("Alice");
  const t0 = Date.now();
  await waitFor(() => t.frame().turn.ritWaiting, { timeout: 8000, what: "RIT prompt 2" });
  const left = t.frame().turn.nextStepAt - Date.now();
  console.log("      prompt window announced:", left, "ms; text:", (await text(P.Alice)).match(/Waiting for run it twice decisions \(\d+s\)/)?.[0]);
  await P.Alice.shoot("b3-14-rit-waiting");
  await waitFor(() => !t.frame().turn.ritWaiting, { timeout: 15000, what: "prompt timeout" });
  const dt = Date.now() - t0; console.log("      prompt expired after", dt, "ms");
  assert(dt > 9000 && dt < 11800, "10 s window: " + dt);
  await waitFor(() => t.frame().table.status === "waiting", { timeout: 60000, what: "end" });
  const l2 = norm(await t.log(2)); const j = l2.indexOf("Remaining players decide whether to run it twice.");
  expectLog(l2.slice(j).map(combo).slice(0, 3), ["Remaining players decide whether to run it twice.", "Some players choose to not run it twice.", "Alice shows a Q♣, Q♦."], "timeout log");
  assert(l2.some((x) => /^Alice collected 1200 from pot with Pair, Q's/.test(x)), "Alice wins 1200: " + l2.join(" | "));
}
