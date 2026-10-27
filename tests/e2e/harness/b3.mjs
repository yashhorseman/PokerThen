// Phase B3 helpers: build a table over the real API with scripted decks, drive actions through protocol bots (same cookie as the
// browser page of that player, so the page shows exactly what the player sees), and compare log lines byte-for-byte.
import { assert, sleep, waitFor } from "./index.mjs";
import { Bot, mkDeck } from "./proto.mjs";

export { assert, sleep, waitFor, mkDeck };

/** Build `names[i]` at `seats[i]` (names[0] = owner, seat 1). Returns { owner, gid, P: {name: PlayerHandle}, B: {name: Bot}, cfg(patch) }. */
export async function makeTable(h, names, { seats, stacks, spectators = [], cfg: cfgPatch, owner: ownerStack, pages = true, start = false } = {}) {
  const P = {}; const B = {};
  const owner = await h.player(names[0]); P[names[0]] = owner;
  const gid = await owner.createTable(names[0]);
  for (let i = 1; i < names.length; i++) {
    const p = await h.player(names[i]); P[names[i]] = p;
    await p.joinAndSit(gid, seats?.[i] ?? i + 1, stacks?.[i] ?? 1000, undefined, spectators.includes(names[i]));
  }
  for (let i = 1; i < names.length; i++) await owner.approveAll([P[names[i]]]);
  if (ownerStack && ownerStack !== 1000) { const r = await owner.api("POST", `/games/${gid}/update_player`, { playerID: owner.playerID, stackChange: ownerStack, stackChangeMode: "SET" }); assert(r.status === 200, "owner stack " + r.text); }
  for (const n of names) { B[n] = await new Bot(P[n]).connect(); }
  const t = {
    h, owner, gid, P, B, names,
    async cfg(patch, expectQueued) {
      const c = (await owner.api("GET", `/games/${gid}/current_or_next_configs`)).json; delete c.queued;
      const r = await owner.api("POST", `/games/${gid}/update_game`, { ...c, ...patch });
      assert(r.status === 200, "update_game " + r.text);
      if (expectQueued !== undefined) assert(r.json.queued === expectQueued, `queued=${expectQueued}: ` + r.text);
      return r;
    },
    start: () => owner.startGame().then((r) => { assert(r.status === 200, "start " + r.text); }),
    id: (n) => P[n].playerID,
    frame: () => B[names[0]].frame,
    stack: (n) => B[names[0]].frame.players[P[n].playerID]?.stack,
    stacks: () => Object.fromEntries(names.map((n) => [n, B[names[0]].frame.players[P[n].playerID]?.stack])),
    /** the bot whose turn it is (waits) */
    async turn(timeout = 15000) { return waitFor(() => names.map((n) => B[n]).find((b) => b.myTurn), { timeout, what: "a turn" }); },
    /** assert it is `name`'s turn and act */
    async act(name, type, extra) {
      const b = await t.turn();
      assert(b.name === name, `expected ${name} to act, got ${b.name}`);
      const before = b.frame.turn.actionStartedAt;
      b.action(type, extra);
      await waitFor(() => !b.myTurn || b.frame.turn.actionStartedAt !== before, { timeout: 5000, what: name + " action applied" });
      await sleep(120);
    },
    fold: (n) => t.act(n, "PLAYER_FOLD"), check: (n) => t.act(n, "PLAYER_CHECK"), call: (n) => t.act(n, "PLAYER_CALL"),
    raise: (n, v) => t.act(n, "PLAYER_RAISE", { value: v }),
    /** wait until the game settles at hand end (result shown) */
    async result(timeout = 20000) { return waitFor(() => B[names[0]].frame.result && B[names[0]].frame.turn.taking === null, { timeout, what: "result" }); },
    /** log lines (oldest first) of hand n as seen by player `who` (default owner); fairness lines and ids are normalised */
    async log(n, who = names[0]) {
      const r = await P[who].api("GET", `/api/games/${gid}/log_v3?hand_number=${n}`);
      assert(r.status === 200, "log_v3 " + r.text);
      return r.json.map((e) => e.msg);
    },
    close() { for (const n of names) B[n].close(); }
  };
  if (cfgPatch) await t.cfg(cfgPatch);
  if (start) await t.start();
  return t;
}

/** replace `"Name @ id"` with Name, hand ids with ID, and drop the two fairness lines + private "Your hand is" lines unless keepHands */
export function norm(lines, { keepHands = false, keepFair = false } = {}) {
  return lines
    .map((m) => m.replace(/"([^"@]+) @ [^"]+"/g, "$1").replace(/\(id: [a-z]{12}\)/, "(id: ID)"))
    .filter((m) => (keepFair || !/^Hand (commitment|reveal)/.test(m)) && (keepHands || !/^Your hand is/.test(m)));
}

/** byte-exact comparison (JSON-escaped diff on failure) */
export function expectLog(actual, expected, what = "log") {
  const a = JSON.stringify(actual, null, 1), e = JSON.stringify(expected, null, 1);
  if (a !== e) throw new Error(`${what} mismatch\n--- expected\n${expected.map((x) => JSON.stringify(x)).join("\n")}\n--- actual\n${actual.map((x) => JSON.stringify(x)).join("\n")}`);
}
export function expectHas(actual, expectedLine, what = "log") {
  if (!actual.includes(expectedLine)) throw new Error(`${what}: line not found ${JSON.stringify(expectedLine)} in\n${actual.map((x) => JSON.stringify(x)).join("\n")}`);
}
export const text = (p) => p.page.evaluate(() => document.body.innerText);
export async function seeText(p, re, timeout = 8000) {
  return waitFor(async () => { const t = await text(p); return re.test(t) ? t : null; }, { timeout, what: `text ${re} on ${p.name}` });
}

const CANON_LIST = [..."cdhs"].flatMap((s) => [..."23456789TJQKA"].map((r) => r + s));
/** Deck for one hand. `holes` = hole pairs in DEAL ORDER (first seat left of the dealer first), `board` = flop(3)+turn+river (+run 2 cards after).
 *  Burn cards are picked from unused cards. */
export function mkHand(holes, board = [], board2 = []) {
  const used = new Set([...holes.flat(), ...board, ...board2]);
  const spare = CANON_LIST.filter((c) => !used.has(c)).reverse();
  const burn = () => spare.pop();
  const pre = [...holes.map((x) => x[0]), ...holes.map((x) => x[1])];
  const b = [...board];
  if (b.length) { pre.push(burn(), ...b.splice(0, 3)); }
  if (b.length) { pre.push(burn(), b.shift()); }
  if (b.length) { pre.push(burn(), b.shift()); }
  pre.push(...b);
  if (board2.length) { const c = [...board2]; pre.push(burn(), ...c.splice(0, 3)); if (c.length) pre.push(burn(), c.shift()); if (c.length) pre.push(burn(), c.shift()); }
  return mkDeck(pre);
}
/** visible action buttons: [{text, disabled}] */
export const buttons = (p) => p.page.evaluate(() => [...document.querySelectorAll(".action-button")].filter((b) => b.offsetParent !== null).map((b) => ({ text: (b.value || b.textContent || "").trim().replace(/\s+/g, " "), disabled: b.disabled || b.classList.contains("disabled") })));

/** known UI difference reported in docs/requests/b3-*.md: printed, does not fail the run */
export const soft = (cond, msg) => { if (!cond) console.log("      KNOWN-DIFF (see docs/requests/b3-*.md): " + msg); };

/** wait until the hand is closed and the table idles between hands (autoDeal off) */
export async function idle(t, timeout = 25000) {
  try { return await waitFor(() => { const f = t.frame(); return f.result && f.turn.nextStep === null && !f.turn.taking; }, { timeout, what: "between hands" }); }
  catch (e) { const f = t.frame(); throw new Error(e.message + " " + JSON.stringify({ result: !!f.result, nextStep: f.turn.nextStep, taking: f.turn.taking, status: f.table.status, hand: f.table.handNumber, rit: f.turn.ritWaiting })); }
}

import { clickBtn, dismissAlert } from "./ui.mjs";
export { clickBtn, dismissAlert };
/** owner: seat menu of the player called `name` -> Edit Player (real clicks) */
export async function openEditFor(owner, name) {
  await owner.page.evaluate((n) => {
    const el = [...document.querySelectorAll(".table-player:not(.empty)")].find((e) => e.innerText.includes(n));
    el.querySelector(".table-player-infos-ctn").click();
  }, name);
  await owner.page.waitForSelector(".player-controls-popover");
  await clickBtn(owner, /^edit player/i, ".player-controls-popover button");
  await owner.page.waitForSelector(".config-edit-player", { timeout: 5000 });
}
export async function confirmOverlay(p, ok = true) {
  await p.page.waitForSelector(".pt-overlay-scrim .alert-1");
  const msg = await p.page.$eval(".pt-overlay-scrim .alert-1-message", (e) => e.textContent);
  const btns = await p.page.$$(".pt-overlay-scrim .alert-1-buttons .button-1");
  await (ok ? btns[btns.length - 1] : btns[0]).click();
  return msg;
}
export const click = (p, sel) => p.page.evaluate((s) => document.querySelector(s).click(), sel);
