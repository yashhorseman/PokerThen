// B3-13: run it twice, 3 players all-in preflop, everybody votes yes (log wording with the double spaces), two runs, ODD pot 1005 split 503 (run 1) / 502 (run 2)
// like research 08 b, `... on the second run  (combination:` with two spaces, all-in reveal lines, `Flop (second run):  [..]`.
import { join } from "node:path";
import { makeTable, mkHand, norm, expectLog, assert, sleep, seeText, waitFor, idle, text } from "../harness/b3.mjs";

// deal order Bob, Carol, Alice
const D1 = { pre: [0], deck: mkHand([["Ah", "3d"], ["4c", "5d"], ["Js", "6h"]], ["Jd", "6c", "2c", "9s", "Kd"], ["Jc", "6d", "3s", "9h", "Qs"]) };
export const options = { decks: [D1] };

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob", "Carol"], { stacks: [335, 335, 335], owner: 335, cfg: { runItTwice: "ask_players", autoDeal: false } });
  const { P, B } = t;
  await t.start();
  await t.raise("Alice", 335); await t.call("Bob"); await t.call("Carol");
  await waitFor(() => t.frame().turn.ritWaiting, { timeout: 8000, what: "RIT prompt" });
  await seeText(P.Bob, /Waiting for run it twice decisions \(\d+s\)/, 3000);
  for (const n of ["Alice", "Bob", "Carol"]) await P[n].page.waitForSelector(".rit-container", { timeout: 3000 });
  await P.Carol.shoot("b3-13-rit-prompt");
  B.Alice.action("DRITD", { decision: true }); await sleep(250); B.Bob.action("DRITD", { decision: true }); await sleep(250); B.Carol.action("DRITD", { decision: true });
  await waitFor(() => t.frame().table.status === "waiting", { timeout: 70000, what: "hand over, busted players leave" });
  const l = norm(await t.log(1));
  const i = l.indexOf("Remaining players decide whether to run it twice.");
  assert(i > 0, "RIT ask line");
  const rest = l.slice(i);
  const combo = (s) => s.replace(/\(combination: [^)]+\)$/, "(combination: X)");
  expectLog(rest.map(combo), [
    "Remaining players decide whether to run it twice.",
    "Alice chooses to  run it twice.", "Bob chooses to  run it twice.", "Carol chooses to  run it twice.",
    "All players in hand choose to run it twice.",
    "Alice shows a J♠, 6♥.", "Bob shows a A♥, 3♦.", "Carol shows a 4♣, 5♦.",
    "Flop:  [J♦, 6♣, 2♣]", "Turn: J♦, 6♣, 2♣ [9♠]", "River: J♦, 6♣, 2♣, 9♠ [K♦]",
    "Flop (second run):  [J♣, 6♦, 3♠]", "Turn (second run): J♣, 6♦, 3♠ [9♥]", "River (second run): J♣, 6♦, 3♠, 9♥ [Q♠]",
    "Alice collected 503 from pot with Two Pair, J's & 6's (combination: X)",
    "Alice collected 502 from pot with Two Pair, J's & 6's on the second run  (combination: X)",
    "-- ending hand #1 --"
  ], "run it twice log");
  console.log("      collect lines:", rest.filter((x) => /collected/.test(x)).join(" || "));
  assert(t.stack("Alice") === 1005, "Alice has the whole 1005: " + JSON.stringify(t.stacks()));
  assert(rest.includes("The player Bob quits the game with a stack of 0.") || (norm(await t.log(2))).includes("The player Bob quits the game with a stack of 0."), "busted players quit");
  await P.Alice.shoot("b3-13-rit-end");
}
