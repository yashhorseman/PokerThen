// Shared puppeteer helpers for the W5 harness (dev server + browser).
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export async function start() {
  const server = await createServer({ configFile: here("./harness/vite.config.ts"), server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: process.env.HEADED ? false : "new", args: ["--no-sandbox"] });
  return { server, browser, url, close: async () => { await browser.close(); await server.close(); } };
}

export async function open(browser, url, w, h, scenario) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  await page.setViewport({ width: w, height: h });
  await page.goto(url, { waitUntil: "networkidle0" });
  if (scenario) await page.evaluate((s) => window.__setScenario(s), scenario);
  await new Promise((r) => setTimeout(r, 250));
  page.errors = errors;
  return page;
}

/** rect of the first element matching selector, relative to the document (px). */
export const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
