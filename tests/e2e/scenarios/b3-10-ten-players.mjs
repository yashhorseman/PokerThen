// B3-10: 10-player table: every seat filled, random-but-legal play for several hands over the protocol while the owner's desktop page and an iPhone page
// are open; geometry sanity (plates inside the canvas, no overlap) and chip conservation (sum of stacks + open bets == 10 x 1000 at every observation).
import { join } from "node:path";
import { assert, sleep, waitFor, soft, text } from "../harness/b3.mjs";
import { Bot } from "../harness/proto.mjs";

const NAMES = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"];

async function geometry(p, label) {
  return p.page.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, t: (e.innerText || "").replace(/\s+/g, " ").slice(0, 30) }; };
    const plates = [...document.querySelectorAll(".table-player:not(.empty) .table-player-infos-ctn")].map(r);
    const vw = innerWidth, vh = innerHeight;
    const outside = plates.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > vw + 1 || b.y + b.h > vh + 1);
    const overlaps = [];
    for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) {
      const a = plates[i], b = plates[j];
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 2 && iy > 2) overlaps.push(`${a.t} x ${b.t} (${Math.round(ix)}x${Math.round(iy)})`);
    }
    return { n: plates.length, outside: outside.map((b) => b.t), overlaps };
  });
}

export default async function (h) {
  h.shotDir = join(h.shotDir, "../b3");
  const owner = await h.player("Alice"); const gid = await owner.createTable("Alice");
  const players = [owner];
  for (let i = 1; i < 10; i++) { const p = await h.player(NAMES[i], i === 4 ? { phone: true } : {}); await p.joinAndSit(gid, i + 1, 1000); players.push(p); }
  await owner.approveAll(players.slice(1));
  const bots = []; for (const p of players) bots.push(await new Bot(p).connect());
  const cfg = (await owner.api("GET", `/games/${gid}/current_or_next_configs`)).json; delete cfg.queued;
  assert((await owner.api("POST", `/games/${gid}/update_game`, { ...cfg, showdownTime: "fast" })).status === 200, "cfg");
  assert((await owner.startGame()).status === 200, "start");
  await sleep(1200);
  assert(bots[0].frame.seats.length === 10, "10 seats taken");
  const g1 = await geometry(owner, "desktop"); const g2 = await geometry(players[4], "phone");
  console.log("      geometry desktop:", JSON.stringify(g1), "| phone:", JSON.stringify(g2));
  assert(g1.n === 10 && g2.n === 10, "10 plates rendered on both: " + g1.n + "/" + g2.n);
  assert(g1.outside.length === 0, "desktop plates inside the viewport: " + g1.outside);
  soft(g1.overlaps.length === 0, "desktop plates overlap: " + g1.overlaps.join("; "));
  soft(g2.outside.length === 0 && g2.overlaps.length === 0, "phone plates outside/overlap: " + JSON.stringify(g2));
  await owner.shoot("b3-10-ten-desktop"); await players[4].shoot("b3-10-ten-phone");
  // random legal play for 3 hands; chips conserved at each decision point (stack + open bets + collected pot == 10000)
  let seenHands = new Set(); let decisions = 0; const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const f = bots[0].frame;
    if (f.table.handNumber >= 3 && f.result) break;
    const b = bots.find((x) => x.myTurn);
    if (!b) { await sleep(100); continue; }
    const fr = b.frame; const hv = fr.hand;
    const sum = fr.seats.reduce((a, [, id]) => a + fr.players[id].stack, 0); // frame stacks still include the open bet (SPEC 4.5)
    if (!(sum + hv.pot === 10000)) throw new Error(`chips not conserved at hand ${hv.handNumber}: stacks ${sum} + collected pot ${hv.pot} != 10000`);
    seenHands.add(hv.handNumber); decisions++;
    const owe = Math.max(0, hv.highestBet - (typeof hv.bets[b.id] === "number" ? hv.bets[b.id] : 0));
    const r = Math.random();
    if (owe === 0) { if (r < 0.7) b.action("PLAYER_CHECK"); else if (r < 0.9) b.action("PLAYER_RAISE", { value: Math.min(hv.minRaise + 20, b.stack + (typeof hv.bets[b.id] === "number" ? hv.bets[b.id] : 0)) }); else b.action("PLAYER_CHECK"); }
    else if (r < 0.45) b.action("PLAYER_CALL"); else if (r < 0.6) b.action("PLAYER_RAISE", { value: Math.min(hv.minRaise, b.stack + (typeof hv.bets[b.id] === "number" ? hv.bets[b.id] : 0)) }); else b.action("PLAYER_FOLD");
    const before = fr.turn.actionStartedAt;
    await waitFor(() => !b.myTurn || b.frame.turn.actionStartedAt !== before, { timeout: 3000, what: "action applied" }).catch(() => {});
    await sleep(60);
  }
  console.log(`      played ${decisions} decisions over hands ${[...seenHands].join(",")}`);
  assert(seenHands.size >= 2, "several hands played");
  await sleep(2000);
  const f = bots[0].frame;
  const end = f.seats.reduce((a, [, id]) => a + f.players[id].stack, 0);
  assert(end === 10000, "all chips back in stacks after the hand: " + end);
  await owner.shoot("b3-10-ten-after");
  bots.forEach((b) => b.close());
}
