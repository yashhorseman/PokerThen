// B1: menus/chrome tour with 6 seated + spectator at one viewport. node tour.mjs [w] [h]
import { session, shot, sleep, whoseTurn, act, clickBtn, gotIt, waitFor, OUT } from "./lib.mjs";
const w = +(process.argv[2] ?? 1440), vh = +(process.argv[3] ?? 900); const tag = `-${w}x${vh}`;
const s = await session({ n: 6, w, h: vh, start: false });
try {
  const [a, b] = s.ps;
  const spec = await s.h.player("Spec", { width: w, height: vh });
  await spec.open(`/games/${s.gid}`); await spec.page.waitForSelector(".table-player"); await sleep(600);
  await shot(spec, "20-spectator-waiting", tag);
  await clickBtn(a, /start game/i); await sleep(1500);
  await shot(spec, "21-spectator-hand", tag);
  await gotIt([spec]);
  await shot(spec, "21b-spectator-hand-tos-dismissed", tag);
  await shot(a, "22-six-seats-preflop", tag);
  const btn = async (p, sel) => p.page.evaluate((s) => document.querySelector(s)?.click(), sel);
  // options + tabs
  await btn(a, ".top-buttons-button.options"); await sleep(500); await shot(a, "23-options-popover", tag);
  await clickBtn(a, /game configurations/i); await sleep(700); await shot(a, "24-config-game", tag);
  await a.page.evaluate(() => document.querySelector(".config-screen")?.scrollTo?.(0, 99999));
  await a.page.evaluate(() => { const e = [...document.querySelectorAll(".config-screen *")].find((x) => x.scrollHeight > x.clientHeight + 20 && getComputedStyle(x).overflowY !== "visible"); if (e) e.scrollTop = 99999; });
  await sleep(300); await shot(a, "24b-config-game-scrolled", tag);
  await clickBtn(a, /^players/i, ".config-top-tab-buttton"); await sleep(600); await shot(a, "25-config-players", tag);
  await a.page.evaluate(() => [...document.querySelectorAll(".config-screen .button-1")].find((x) => /edit/i.test(x.textContent))?.click()); await sleep(600); await shot(a, "26-edit-player", tag);
  await clickBtn(a, /^preferences/i, ".config-top-tab-buttton"); await sleep(600); await shot(a, "27-config-preferences", tag);
  await a.page.evaluate(() => { const e = [...document.querySelectorAll(".config-screen *")].find((x) => x.scrollHeight > x.clientHeight + 20 && getComputedStyle(x).overflowY !== "visible"); if (e) e.scrollTop = 99999; });
  await sleep(300); await shot(a, "27b-config-preferences-scrolled", tag);
  await clickBtn(a, /back/i, ".config-top-tab-buttton"); await sleep(500);
  // guest (non-owner) config
  await btn(b, ".top-buttons-button.options"); await sleep(400); await shot(b, "28-options-guest", tag);
  await btn(b, ".top-buttons-button.options"); await sleep(300);
  // log + ledger
  await a.page.keyboard.press("l"); await sleep(1000); await shot(a, "29-log", tag);
  await clickBtn(a, /^ledger/i, ".pt-foot-tabs button, .pt-foot-tabs *"); await sleep(1000); await shot(a, "30-ledger", tag);
  await a.page.evaluate(() => document.querySelector(".pt-details-btn")?.click()); await sleep(500); await shot(a, "30b-ledger-details", tag);
  await a.page.evaluate(() => document.querySelector(".pt-modal-close button, .pt-modal-close")?.click()); await sleep(400);
  // chat expanded + message + bubble
  await a.page.evaluate(() => document.querySelector(".pt-chat-expand")?.click()); await sleep(500);
  await b.page.keyboard.press("m"); await sleep(300); await b.page.keyboard.type("hello from Bob this is a long message for testing"); await shot(b, "31-chat-compose", tag); await b.page.keyboard.press("Enter");
  await sleep(700); await shot(a, "32-chat-expanded-bubble", tag);
  await a.page.evaluate(() => document.querySelector(".pt-chat-expand")?.click()); await sleep(400);
  await shot(a, "33-chat-collapsed-bubble", tag);
  // seat menu + sit popover
  await spec.page.evaluate(() => document.querySelector(".table-player.empty .table-player-seat")?.click()); await sleep(500); await shot(spec, "34-sit-popover", tag);
  await a.page.evaluate(() => document.querySelector(".table-player-2 .table-player-infos-ctn")?.click()); await sleep(500); await shot(a, "35-seat-menu", tag);
  // your turn
  const t = await whoseTurn(s.ps, 20000); await sleep(500); await shot(t, "36-yourturn-" + t.name, tag);
  await t.page.evaluate(() => [...document.querySelectorAll(".action-button")].find((x) => /^(raise|bet)/i.test(x.textContent))?.click()); await sleep(600); await shot(t, "37-bet-panel", tag);
  console.log("done");
} finally { await s.h.close(); }
