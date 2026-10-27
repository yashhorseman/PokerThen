// INTEGRATION E5: a real showdown hand, then /verify (browser) PASS on the server record and FAIL on tampered copies;
// scripts/verify-hand.ts exits 0 on the real record and 1 on a tampered one.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, sleep, waitFor, ROOT } from "../harness/index.mjs";
import { Bot, mkDeck, waitTurn } from "../harness/proto.mjs";

export const options = { decks: [{ pre: [0], deck: mkDeck(["9c", "Qs", "Ac", "8d", "Qd", "Ad", "3c", "2h", "7h", "Js", "4c", "5d", "6s", "Kd"]) }] };

export default async function (h) {
  const owner = await h.player("Alice"); const gid = await owner.createTable("Alice");
  const bob = await h.player("Bob"), carol = await h.player("Carol");
  await bob.joinAndSit(gid, 2); await carol.joinAndSit(gid, 3); await owner.approveAll([bob, carol]);
  const bots = []; for (const p of [owner, bob, carol]) bots.push(await new Bot(p).connect());
  const [A, B, C] = bots;
  await owner.startGame();
  await waitFor(() => bots.some((b) => b.myTurn), { what: "turn" });
  let t = await waitTurn(bots); assert(t === A, "Alice first"); A.action("PLAYER_RAISE", { value: A.stack }); await sleep(1000);
  t = await waitTurn(bots); B.action("PLAYER_FOLD"); await sleep(1000);
  t = await waitTurn(bots); C.action("PLAYER_CALL");
  // wait for hand 2 (hand 1 reveal is published at the end of the result window)
  await waitFor(() => A.frame.table.handNumber >= 2, { timeout: 40000, what: "hand 2" });
  await sleep(500);
  const rec = (await owner.api("GET", `/api/games/${gid}/fairness/1`)).json;
  assert(rec.reveal && rec.reveal.cards.length >= 9, "reveal has holes+board: " + (rec.reveal?.cards?.length));
  const unknown = (await owner.api("GET", `/api/games/${gid}/fairness/1`)).text;
  assert(!/masterSalt|"deck"/.test(unknown), "record carries no deck/masterSalt");

  const verifyPage = async (path, expect, paste) => {
    const p = owner.page; await p.goto(h.url + path, { waitUntil: "domcontentloaded" });
    if (paste) {
      await p.waitForSelector(".pt-link-btn"); await p.click(".pt-link-btn"); await p.waitForSelector(".pt-paste textarea");
      const [ta] = await p.$$(".pt-paste textarea");
      await p.evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, ta, paste.record);
      await p.evaluate(() => { document.querySelector(".pt-verify-form input").value; });
      const [i1, i2] = await p.$$(".pt-verify-form input");
      await i1.click({ clickCount: 3 }); await p.keyboard.type(gid); await i2.click({ clickCount: 3 }); await p.keyboard.type("1");
      await p.click(".pt-load-btn");
    }
    await p.waitForSelector(".pt-verdict", { timeout: 10000 });
    const word = await p.$eval(".pt-verdict-word", (e) => e.textContent.trim());
    await p.screenshot({ path: join(ROOT, `research-scratch/shots/integration/e5-verify-${expect.toLowerCase()}.png`), fullPage: true });
    assert(word === expect, `/verify says ${word}, expected ${expect} (${path})`);
  };
  await verifyPage(`/verify?game=${gid}&hand=1`, "PASS");
  // tampered: change one revealed card
  const bad = JSON.parse(JSON.stringify(rec)); const c0 = bad.reveal.cards[0]; c0.card = c0.card === "2c" ? "3c" : "2c";
  await verifyPage(`/verify`, "FAIL", { record: JSON.stringify(bad) });
  // tampered: wrong commitment
  const bad2 = JSON.parse(JSON.stringify(rec)); bad2.commitment = bad2.commitment.replace(/^./, (x) => (x === "0" ? "1" : "0"));
  await verifyPage(`/verify`, "FAIL", { record: JSON.stringify(bad2) });
  // CLI
  const dir = mkdtempSync(join(tmpdir(), "pt-verify-"));
  writeFileSync(join(dir, "ok.json"), JSON.stringify(rec)); writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
  const run = (f) => spawnSync(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "scripts/verify-hand.ts"), join(dir, f)], { encoding: "utf8", cwd: ROOT });
  const ok = run("ok.json"), no = run("bad.json");
  assert(ok.status === 0, "CLI PASS on real record: " + ok.stdout + ok.stderr);
  assert(no.status === 1, "CLI FAIL on tampered record: " + no.status + no.stdout);
  // chain across hands
  const r2 = (await owner.api("GET", `/api/games/${gid}/fairness/2`)).json;
  assert(r2.prevCommitment === rec.commitment, "hand 2 chains to hand 1");
  bots.forEach((b) => b.close());
}
