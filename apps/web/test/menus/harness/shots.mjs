// node apps/web/test/menus/harness/shots.mjs  -> research-scratch/shots/w7/*.png (+ DOM assertions printed)
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import path from "node:path";
import fs from "node:fs";
const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(here, "../../../../../research-scratch/shots/w7");
fs.mkdirSync(out, { recursive: true });
const server = await createServer({ configFile: path.join(here, "vite.config.ts"), server: { port: 5390 + Math.floor(Math.random() * 400), strictPort: true } });
await server.listen();
const base = `http://localhost:${server.config.server.port}`;
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const VIEWS = [
  ["options", ""], ["players", ""], ["edit", ""], ["edit-pending", ""], ["config-game", ""], ["config-game", "running=1&queued=1"],
  ["config-game", "as=guest"], ["prefs", ""], ["sit", ""], ["log", ""], ["ledger", ""], ["chat", ""], ["chat", "compose=1"], ["chat", "sheet=1"]
];
const vps = [["d", 1440, 900, 1, "landscape"], ["p", 390, 844, 3, "portrait"]];
const logs = [];
for (const [tag, w, h, dpr, o] of vps) {
  const page = await browser.newPage();
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`[${tag}] ${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[${tag}] pageerror: ${e.message}`));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: tag === "p", hasTouch: tag === "p" });
  for (const [view, extra] of VIEWS) {
    await page.goto(`${base}/?view=${view}&o=${o}${extra ? "&" + extra : ""}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    const name = `${tag}-${view}${extra ? "-" + extra.replace(/[=&]/g, "_") : ""}`;
    await page.screenshot({ path: path.join(out, name + ".png") });
  }
  await page.close();
}
await browser.close();
await server.close();
console.log(logs.length ? logs.join("\n") : "no console errors/warnings");
