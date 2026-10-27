// E2E harness (W3). Real server + isolated puppeteer contexts (one per player) + API-level helpers that do not depend on UI selectors.
// Usage in a scenario:  export default async function (h) { const a = await h.player("Alice"); ... }   (see tests/e2e/run.mjs)
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { WebSocket } from "ws";
import { ROOT, startServer } from "./server.mjs";

export { startServer, ROOT };
export const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 10000, interval = 50, what = "condition" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await sleep(interval);
  }
}

export class Harness {
  constructor(server, opts) {
    this.server = server; this.opts = opts; this.browser = null; this.players = []; this.shotDir = opts.shotDir ?? join(ROOT, "research-scratch/shots/e2e");
  }
  get url() { return this.server.url; }

  async browserInstance() {
    if (!this.browser) this.browser = await puppeteer.launch({ executablePath: CHROME, headless: process.env.E2E_HEADED === "1" ? false : "new", args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"] });
    return this.browser;
  }

  /** One incognito context + page per player. phone => iPhone UA, touch, DPR 3, 390x844. */
  async player(name, { phone = false, width, height } = {}) {
    const b = await this.browserInstance();
    const ctx = await b.createBrowserContext();
    const page = await ctx.newPage();
    if (phone) { await page.setUserAgent(IPHONE_UA); await page.setViewport({ width: width ?? 390, height: height ?? 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); }
    else await page.setViewport({ width: width ?? 1440, height: height ?? 900 });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    const p = new PlayerHandle(this, name, ctx, page, errors);
    this.players.push(p);
    return p;
  }

  async restartServer(opts) { await this.server.restart(opts); }

  async close() {
    for (const p of this.players) await p.ws?.close?.();
    await this.browser?.close().catch(() => {});
    await this.server.dispose();
  }
}

export async function createHarness(opts = {}) {
  const server = await startServer(opts);
  return new Harness(server, opts);
}

/** A player = browser context + page, plus an API-level session sharing the same cookie. */
export class PlayerHandle {
  constructor(h, name, ctx, page, errors) { Object.assign(this, { h, name, ctx, page, errors, gameID: null, playerID: null }); }

  async open(path = "/home") { await this.page.goto(this.h.url + path, { waitUntil: "domcontentloaded" }); return this; }
  async cookie() { const cs = await this.page.cookies(this.h.url); return cs.find((c) => c.name === "ptn")?.value ?? null; }
  async identity() { await this.open("/home").catch(() => {}); const r = await this.api("GET", "/current-player-infos"); this.playerID = r.json?.id; return this.playerID; }

  /** same-origin fetch inside the page (cookie + Origin exactly like the real client) */
  async api(method, path, body) {
    if (this.page.url() === "about:blank") await this.open("/home");
    return this.page.evaluate(async (m, p, b) => {
      const r = await fetch(p, { method: m, headers: b === undefined ? {} : { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
      return { status: r.status, text, json };
    }, method, path, body);
  }

  /** createTable(name): through the HTTP API (UI form is exercised by W8's scenarios); lands the page on the table. */
  async createTable(ownerName = this.name) {
    await this.open("/home");
    const r = await this.api("POST", "/new-game", { playerName: ownerName, gM: "th", playerStack: 1000, bigBlind: 20, smallBlind: 10, cM: false });
    if (r.status !== 200) throw new Error(`new-game failed ${r.status} ${r.text}`);
    this.gameID = r.json.gameID; this.playerID = r.json.playerID;
    await this.open(`/games/${this.gameID}`);
    return this.gameID;
  }

  /** joinAndSit(table owner's gameID, seat, stack): request via API as a guest (page lands on the table first so the WS/spectator state exists) */
  async joinAndSit(gameID, seat, stack = 1000, nick = this.name, allowSpectator = false) {
    this.gameID = gameID;
    await this.open(`/games/${gameID}`);
    await this.page.waitForSelector(".table-player", { timeout: 10000 });
    this.playerID = (await this.api("GET", "/current-player-infos")).json?.id;
    const r = await this.api("POST", `/games/${gameID}/request_ingress`, { seat, playerName: nick, allowSpectator, stack });
    if (r.status !== 200) throw new Error(`request_ingress ${r.status} ${r.text}`);
    return this;
  }

  /** owner approves every pending request via the API (UI path: W7 E1 scenario) */
  async approveAll(guests, stack) {
    for (const g of guests) {
      const r = await this.api("POST", `/games/${this.gameID}/approve_player`, { playerID: g.playerID, ...(stack ? { stack } : {}) });
      if (r.status !== 200) throw new Error(`approve ${g.name}: ${r.status} ${r.text}`);
    }
  }
  startGame() { return this.api("POST", `/games/${this.gameID}/start-game`, {}); }

  /** raw WS client with cookie of this browser context (for protocol-level scenarios) */
  async socket() {
    const ck = await this.cookie();
    const ws = new WebSocket(`${this.h.url.replace("http", "ws")}/ws?gameID=${this.gameID}&layout=d`, { headers: { origin: this.h.url, cookie: `ptn=${ck}` } });
    const msgs = [];
    ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    return { ws, msgs, send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close(), until: (fn, t) => waitFor(() => fn(msgs), { timeout: t ?? 8000, what: "ws message" }) };
  }

  /** act(): UI-driven button click by visible label (SPEC 6.1 labels: Fold, Check, Call, Raise to, Bet, All In ...). `raise 100` types the amount. */
  async act(what) {
    const [verb, amount] = what.split(/\s+/);
    const label = { fold: "fold", check: "check", call: "call", raise: "raise", bet: "bet", allin: "all in" }[verb.toLowerCase()] ?? verb;
    await this.clickText(label, ".action-button, .button-1");
    if (amount) {
      await this.page.waitForSelector(".raise-controller-form input", { timeout: 3000 });
      await this.page.click(".raise-controller-form input", { clickCount: 3 });
      await this.page.keyboard.type(String(amount));
      await this.page.keyboard.press("Enter");
    }
  }
  async clickText(text, selector = "button, .button-1, a", timeout = 5000) {
    const t = text.toLowerCase();
    const handle = await waitFor(async () => {
      const hs = await this.page.$$(selector);
      for (const hd of hs) { const s = await hd.evaluate((e) => (e.textContent ?? "").trim().toLowerCase()); if (s.startsWith(t)) return hd; }
      return null;
    }, { timeout, what: `button "${text}"` });
    await handle.click();
  }
  waitText(text, timeout = 8000) { return this.page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, text); }
  waitClass(selector, cls, timeout = 8000) { return this.page.waitForFunction((s, c) => document.querySelector(s)?.classList.contains(c), { timeout }, selector, cls); }
  /** measure(selector) => { x, y, width, height, fontSize, ... } of the first match (or null) */
  measure(selector) {
    return this.page.evaluate((s) => {
      const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { x: r.x, y: r.y, width: r.width, height: r.height, fontSize: parseFloat(cs.fontSize), color: cs.color, background: cs.backgroundColor, display: cs.display, zIndex: cs.zIndex };
    }, selector);
  }
  async shoot(name) { const dir = this.h.shotDir; mkdirSync(dir, { recursive: true }); const f = join(dir, `${name}-${this.name}.png`.replace(/[^\w.-]/g, "_")); await this.page.screenshot({ path: f }); return f; }
}

export function assert(cond, msg) { if (!cond) throw new Error("assertion failed: " + msg); }
