import puppeteer from "puppeteer-core";
export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
export const BASE = process.env.W6_BASE ?? "http://localhost:5199/";
export const PHONES = [
  { name: "390x844", w: 390, h: 844 },
  { name: "360x740", w: 360, h: 740 },
  { name: "430x932", w: 430, h: 932 },
  { name: "375x667", w: 375, h: 667 },
  { name: "768x1024", w: 768, h: 1024 }
];
export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
}
export async function open(browser, { w, h, scenario, orient = "portrait", mobile = true }) {
  const page = await browser.newPage();
  if (mobile) {
    await page.setUserAgent(IPHONE_UA);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  }
  await page.goto(`${BASE}?s=${scenario}&o=${orient}`, { waitUntil: "load", timeout: 20000 });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 300));
  return page;
}
/** rect of the first element matching selector, relative to viewport */
export async function rect(page, sel, i = 0) {
  return page.evaluate(
    (sel, i) => {
      const el = document.querySelectorAll(sel)[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    sel,
    i
  );
}
export const remPx = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
