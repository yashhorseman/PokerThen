// B3-11: blind levels: 2-level schedule (10/20 for 1 minute, then 20/40), `Next Blind` info while running, level change applied at a HAND START after the minute
// (new blinds posted, header 20 / 40). Research has no wording for a level-change log line (U-G6): the engine writes none; this test asserts the absence.
import { join } from "node:path";
import { makeTable, mkHand, norm, expectHas, assert, sleep, text, waitFor, soft } from "../harness/b3.mjs";

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const t = await makeTable(h, ["Alice", "Bob"]);
  const { P } = t;
  await t.cfg({ blindLevels: [{ sb: 10, bb: 20, ante: null, durationMin: 1 }, { sb: 20, bb: 40, ante: null, durationMin: null }], showdownTime: "fast" });
  await t.start();
  await sleep(1500);
  let f = t.frame();
  assert(f.table.blinds.level === 1 && f.table.nextBlind?.sb === 20 && f.table.nextBlind?.bb === 40 && typeof f.table.nextBlindAt === "number", "next blind info: " + JSON.stringify([f.table.blinds, f.table.nextBlind]));
  const body = await text(P.Alice);
  console.log("      header:", JSON.stringify((await P.Alice.page.evaluate(() => document.querySelector(".game-infos")?.innerText ?? "")).replace(/\n+/g, " | ")));
  soft(/Next Blind: 20\/40 in \d\d:\d\d/i.test(body), "Next Blind line missing/different (SPEC 4.2: `Next Blind: sb/bb (A: x) in mm:ss`)");
  await P.Alice.shoot("b3-11-level1");
  // fold hands until the minute is over (each hand: the player to act folds)
  const t0 = Date.now();
  while (t.frame().table.blinds.level === 1) {
    if (Date.now() - t0 > 100000) throw new Error("level never changed");
    const b = t.names.map((n) => t.B[n]).find((x) => x.myTurn);
    if (b) { b.action("PLAYER_FOLD"); await sleep(400); } else await sleep(150);
  }
  await waitFor(() => t.frame().hand && t.frame().hand.smallBlindId, { what: "hand with new level" });
  f = t.frame();
  const n = f.table.handNumber;
  console.log(`      level 2 reached after ${Math.round((Date.now() - t0) / 1000)} s of folding, hand #${n}`);
  const log = norm(await t.log(n));
  // heads-up: the dealer posts the small blind and the first dealer is random, so assert amounts and that two different players post them
  const sbName = log.find((x) => /posts a small blind of 20$/.test(x))?.split(" posts")[0];
  const bbName = log.find((x) => /posts a big blind of 40$/.test(x))?.split(" posts")[0];
  assert(sbName && bbName && sbName !== bbName && ["Alice", "Bob"].includes(sbName) && ["Alice", "Bob"].includes(bbName), "level 2 blinds posted by two different players: " + JSON.stringify([sbName, bbName]));
  const prev = norm(await t.log(n - 1));
  assert(prev.some((x) => /^(Alice|Bob) posts a small blind of 10$/.test(x)), "level 1 hand posted a small blind of 10: " + JSON.stringify(prev.slice(0, 6)));
  assert(!log.some((x) => /blind level|Game Config Changes/i.test(x)), "no level-change log line (U-G6)");
  const hdr = await P.Alice.page.evaluate(() => document.querySelector(".game-infos")?.innerText ?? "");
  assert(/20\s*\/\s*40/.test(hdr), "header shows 20 / 40: " + hdr);
  await P.Alice.shoot("b3-11-level2");
}
