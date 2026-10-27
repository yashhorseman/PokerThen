// B2 phone QA driver: real server + real engine + iPhone-emulated context. Usage: node apps/web/test/phone/b2.mjs <WxH> <stage,stage..>
import { join } from "node:path";
import { createHarness, sleep, waitFor } from "../../../../tests/e2e/harness/index.mjs";
import { setupTable, clickBtn, whoseTurn, act, uiSit, dismissAlert, uiAccept, gotIt } from "../../../../tests/e2e/harness/ui.mjs";

async function setupTableLate(h, owner, seats) {
  for (const [p, seat, nick, stack] of seats) { await uiSit(p, owner.gameID, seat, nick, stack ?? 1000); await dismissAlert(p); await uiAccept(owner); await sleep(300); }
}
const [W, H] = (process.argv[2] ?? "390x844").split("x").map(Number);
const stages = (process.argv[3] ?? "sit,wait,turn").split(",");
const orient = async (p) => { if (W > H) await p.page.evaluateOnNewDocument(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch {} }; d(screen.orientation, "type", "landscape-primary"); d(screen.orientation, "angle", 90); d(window, "orientation", 90); }); return p; };
const tag = process.argv[4] ?? `${W}x${H}`;
const h = await createHarness({});
h.shotDir = join(h.server ? "" : "", new URL("../../../../research-scratch/shots/b2/", import.meta.url).pathname);
const shot = (p, n) => p.shoot(`${tag}-${n}`);
const probe = async (p, label, list) => {
  const out = await p.page.evaluate((list) => list.map(([sel, i = 0]) => { const e = document.querySelectorAll(sel)[i]; if (!e) return `${sel}[${i}] MISSING`; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${sel}[${i}] ${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)} fs=${parseFloat(cs.fontSize).toFixed(2)} br=${cs.borderTopLeftRadius}`; }), list);
  console.log(`# ${tag} ${label}\n  ` + out.join("\n  "));
};
try {
  const alice = await h.player("Alice");
  const gid = await alice.createTable("Alice");
  const spec = await orient(await h.player("Spec", { phone: true, width: W, height: H }));
  if (stages.includes("sit")) {
    await spec.open(`/games/${gid}`);
    await spec.page.waitForSelector(".table-player.empty");
    await sleep(600);
    await shot(spec, "sit-00-spectator-tos");
    await clickBtn(spec, /got it/i, "button", 1500).catch(() => {});
    await sleep(300);
    await shot(spec, "sit-01-spectator");
    const seats = await spec.page.evaluate(() => [...document.querySelectorAll(".table-player.empty")].map((e) => e.querySelector(".table-player-seat-position-number")?.textContent?.trim()));
    console.log("empty seats", seats);
    for (const n of seats) {
      await spec.page.evaluate((n) => { for (const e of document.querySelectorAll(".table-player.empty")) if (e.querySelector(".table-player-seat-position-number")?.textContent?.trim() === String(n)) e.querySelector(".table-player-seat").click(); }, n);
      await sleep(400);
      await shot(spec, `sit-seat${String(n).padStart(2, "0")}`);
      const r = await spec.page.evaluate(() => { const e = document.querySelector(".request-ingress-popover"); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
      console.log("popover seat", n, JSON.stringify(r));
      await spec.page.keyboard.press("Escape"); await spec.page.mouse.click(5, 5); await sleep(200);
    }
  }
  if (stages.includes("wait") || stages.includes("turn")) {
    const bob = await h.player("Bob"); const dave = await h.player("Dave"); const eve = await h.player("Eve"); const fay = await h.player("Fay");
    const carol = await orient(await h.player("Carol", { phone: true, width: W, height: H }));
    await setupTable(h, alice, [[bob, 2, "Bob"], [carol, 3, "Carol"], [dave, 4, "Dave"], [eve, 5, "Eve"], [fay, 6, "Fay"]]);
    await sleep(500);
    await shot(carol, "wait-00-seated-pregame");
    await clickBtn(alice, /start game/i);
    await sleep(2500);
    await shot(carol, "wait-01-dealt");
    const all = [alice, bob, carol, dave, eve, fay];
    let t = await whoseTurn(all);
    for (let i = 0; i < 6 && t !== carol; i++) { await shot(carol, `wait-02-offturn-${i}`); await act(t, "call"); t = await whoseTurn(all); }
    await sleep(600);
    await shot(carol, "turn-00-your-turn");
    await carol.page.click(".action-button.raise"); await sleep(400);
    await shot(carol, "turn-01-raise-panel");
    await clickBtn(carol, /^all/i, ".default-bet-button"); await sleep(300);
    await shot(carol, "turn-02-raise-allin-preset");
  }
  if (stages.includes("fold")) {
    const bob = await h.player("Bob"); const dave = await h.player("Dave"); const eve = await h.player("Eve"); const fay = await h.player("Fay");
    const carol = await orient(await h.player("Carol", { phone: true, width: W, height: H }));
    await setupTable(h, alice, [[bob, 2, "Bob"], [carol, 3, "Carol"], [dave, 4, "Dave"]]);
    await clickBtn(alice, /start game/i); await sleep(2000);
    const all = [alice, bob, carol, dave];
    // late joiners -> WAITING status
    await setupTableLate(h, alice, [[eve, 5, "Eve"], [fay, 6, "Fay"]]);
    await sleep(500);
    let t = await whoseTurn(all);
    if (t !== carol) { await act(t, "fold"); await sleep(600); }
    await shot(carol, "fold-00-waiting-and-fold");
    t = await whoseTurn(all);
    if (t !== carol) { await act(t, "fold"); await sleep(600); }
    await shot(carol, "fold-01-more-folds");
  }
  if (stages.includes("allin")) {
    const bob = await h.player("Bob"); const dave = { page: null }; const eve = dave;
    const carol = await orient(await h.player("Carol", { phone: true, width: W, height: H }));
    await setupTable(h, alice, [[bob, 2, "Bob"], [carol, 3, "Carol"]]);
    const gid2 = alice.gameID; const cfg = (await alice.api("GET", `/games/${gid2}/current_or_next_configs`)).json; delete cfg.queued;
    console.log("cfg", (await alice.api("POST", `/games/${gid2}/update_game`, { ...cfg, runItTwice: "ask_players", rabbitHunt: true })).status);
    await clickBtn(alice, /start game/i); await sleep(2000);
    const all = [alice, bob, carol];
    let t = await whoseTurn(all);
    // everyone all-in
    let shoved = false, caller = false, shot1 = false;
    for (let i = 0; i < 8; i++) {
      if (await carol.page.$(".rit-container")) break;
      t = await waitFor(async () => (await carol.page.$(".rit-container")) ? "rit" : await whoseTurn(all, 100).catch(() => null), { timeout: 8000, what: "turn or rit" }).catch(() => null); if (!t || t === "rit") break;
      if (t === carol) {
        await shot(carol, `allin-00-your-turn-${i}`);
        if (!shoved) { await carol.page.click(".action-button.raise"); await sleep(300); await clickBtn(carol, /^all/i, ".default-bet-button"); await sleep(300); await shot(carol, "allin-01-panel-allin"); await carol.page.click(".raise-action-buttons input[type=submit]"); shoved = "carol"; await sleep(900); await shot(carol, "allin-02-after-allin"); }
        else { await act(carol, "call"); caller = true; }
      } else if (!shoved) { await act(t, "allin"); shoved = "other"; }
      else if (!caller && shoved === "carol") { await act(t, "call"); caller = true; }
      else await act(t, "fold");
    }
    await carol.page.waitForSelector(".rit-container", { timeout: 15000 }).catch(async (e) => { await shot(carol, "rit-FAIL"); console.log((await carol.page.evaluate(() => document.body.innerText)).slice(0, 600)); throw e; });
    await sleep(500); await shot(carol, "rit-00-prompt"); await probe(carol, "rit-prompt", [[".rit-container"], [".room-owner-paused"], [".game-infos"]]);
    await carol.page.click(".rit-yes"); await sleep(300); await shot(carol, "rit-01-answered");
    for (const p of [alice, bob]) await p.page.click(".rit-yes").catch(() => {});
    await sleep(2500); await shot(carol, "rit-02-reveal");
    await carol.page.waitForSelector(".win-odds", { timeout: 15000 }).catch(() => {});
    await sleep(600); await shot(carol, "rit-03-equity"); await probe(carol, "rit-equity", [[".win-odds"], [".win-odds-container"], [".player-hand-message-ctn"], [".table-player-1 .table-player-infos-ctn"], [".show-hand-buttons"], [".table-cards"]]);
    await sleep(4300); await shot(carol, "rit-04-flop");
    await sleep(8500); await shot(carol, "rit-05-run2");
    await sleep(9000); await shot(carol, "rit-06-result");
    await sleep(2500); await shot(carol, "rit-07-result2");
  }
  if (stages.includes("ui")) {
    const bob = await h.player("Bob"); const dave = await h.player("Dave");
    const carol = await orient(await h.player("Carol", { phone: true, width: W, height: H }));
    const owner = carol;
    const gid3 = await carol.createTable("Carol");
    await sleep(500);
    await shot(carol, "ui-00-alone-owner");
    for (const [p, seat, nick] of [[alice, 2, "Alice"], [bob, 3, "Bob"]]) { await uiSit(p, gid3, seat, nick, 1000); await dismissAlert(p); await uiAccept(owner); await sleep(300); }
    await gotIt([carol]);
    const cfg = (await carol.api("GET", `/games/${gid3}/current_or_next_configs`)).json; delete cfg.queued;
    await carol.api("POST", `/games/${gid3}/update_game`, { ...cfg, rabbitHunt: true, autoDeal: true });
    await sleep(400);
    await shot(carol, "ui-01-pregame-startbtn");
    const clickText = (p, re, sel) => p.page.evaluate((src, sel) => { const r = new RegExp(src, "i"); const e = [...document.querySelectorAll(sel)].find((x) => r.test(x.textContent ?? "") && x.offsetParent !== null); if (e) { e.click(); return true; } return false; }, re.source, sel);
    await clickText(carol, /options/, ".top-buttons-button"); await sleep(400); await shot(carol, "ui-02-options-popover"); await probe(carol, "options", [[".top-controls-options-popover"], [".pt-opt", 0]]);
    await clickText(carol, /game conf/, ".pt-opt"); await sleep(600); await shot(carol, "ui-03-config-game");
    await carol.page.evaluate(() => document.querySelector(".config-screen")?.scrollTo?.(0, 800)); await sleep(300); await shot(carol, "ui-04-config-game-scrolled");
    await clickText(carol, /players/, ".config-top-tab-buttton"); await sleep(500); await shot(carol, "ui-05-config-players");
    await clickText(carol, /preferences/, ".config-top-tab-buttton"); await sleep(500); await shot(carol, "ui-06-config-prefs");
    await clickText(carol, /back/, ".config-top-tab-buttton"); await sleep(400);
    await clickText(carol, /^away/, ".top-buttons-button"); await sleep(500); await shot(carol, "ui-07-away-pregame");
    await clickText(carol, /back/, ".top-buttons-button"); await sleep(300);
    await clickText(carol, /leave/, ".top-buttons-button"); await sleep(500); await shot(carol, "ui-08-leave-dialog");
    await dismissAlert(carol).catch(() => {}); await sleep(300);
    await clickBtn(carol, /start game/i); await sleep(2000);
    const all = [alice, bob, carol];
    let n = 0, raised = false;
    for (let i = 0; i < 10; i++) {
      const t = await whoseTurn(all, 8000).catch(() => null); if (!t) break;
      if (t === carol && !raised) {
        await shot(carol, "ui-10-your-turn");
        await carol.page.click(".action-button.raise"); await sleep(300);
        await carol.page.click("#pt-bet-input", { clickCount: 3 }); await carol.page.keyboard.type("1"); await sleep(200);
        await shot(carol, "ui-11-raise-invalid-typed");
        await carol.page.click("#pt-bet-input", { clickCount: 3 }); await carol.page.keyboard.type("90"); await sleep(200);
        await shot(carol, "ui-12-raise-valid-typed");
        await carol.page.click(".raise-action-buttons input[type=submit]"); raised = true; await sleep(900);
        await shot(carol, "ui-13-after-raise");
      } else if (t === carol) { await act(carol, "call"); }
      else if (!raised) { await act(t, "call").catch(() => act(t, "check")); }
      else await act(t, "fold");
      if (await carol.page.$(".reveal-button")) break;
    }
    await carol.page.waitForSelector(".reveal-button", { timeout: 15000 }).catch(() => console.log("no reveal button"));
    await sleep(500); await shot(carol, "ui-20-result-reveal-bar"); await probe(carol, "result", [[".reveal-button"], [".show-hand-buttons"], [".table-player-stack-prize"], [".table-player-1 .table-player-stack"], [".table-player-1 .table-player-infos-ctn"], [".table-pot-size"]]);
    await clickBtn(carol, /^reveal|reveal/i, ".reveal-button").catch(() => {}); await sleep(900); await shot(carol, "ui-21-rabbit-revealed"); await probe(carol, "rabbit", [[".rh-message"], [".player-hand-message-ctn"]]);
    await sleep(4000); await shot(carol, "ui-22-result-later");
    // chat
    await clickText(carol, /chat/, ".chat-button"); await sleep(600); await shot(carol, "ui-30-chat-sheet-empty"); await probe(carol, "chat-sheet", [[".chat"], [".chat-container"], [".chat-messages-container"], [".chat-new-message-form"], [".chat-new-message-form input"]]);
    await carol.page.click(".chat-new-message-form input").catch(() => {}); await carol.page.keyboard.type("hello from the phone, this is a long message to test truncation"); await sleep(200); await shot(carol, "ui-31-chat-typing");
    await carol.page.keyboard.press("Enter"); await sleep(600); await shot(carol, "ui-32-chat-sent");
    await carol.page.evaluate(() => document.querySelector(".overflow-black")?.click()); await sleep(500); await shot(carol, "ui-33-chat-closed-bubble");
    await alice.page.evaluate(() => document.querySelector(".chat-new-message-button")?.click()); await sleep(300);
    await alice.page.keyboard.type("short msg"); await alice.page.keyboard.press("Enter");
    await sleep(800); await shot(carol, "ui-34-chat-from-other"); await probe(carol, "bubbles", [[".table-player-chat-message", 0], [".table-player-chat-message", 1], [".table-player-2"], [".table-player-3"], [".table-player-1"]]);
    await clickText(carol, /chat/, ".chat-button"); await sleep(600); await shot(carol, "ui-35-chat-sheet-messages"); await probe(carol, "chat-rows", [[".chat-message-container", 0], [".chat-message-container", 1], [".pt-chat-author", 0], [".pt-chat-balloon", 0], [".pt-chat-time", 0]]);
    await carol.page.evaluate(() => document.querySelector(".overflow-black")?.click()); await sleep(400);
    // log + ledger
    await clickText(carol, /^log/, ".pt-log-button"); await sleep(900); await shot(carol, "ui-40-log"); await probe(carol, "log", [[".log-modal"]]);
    await clickText(carol, /ledger/, ".pt-tab"); await sleep(700); await shot(carol, "ui-41-ledger");
  }
} catch (e) { console.error("ERR", e.stack ?? e); process.exitCode = 1; }
finally { for (const p of h.players) if (p.errors.length) console.log(p.name, "console:", p.errors.slice(0, 5)); await h.close(); }
