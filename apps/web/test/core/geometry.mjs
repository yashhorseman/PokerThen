// Puppeteer geometry QA for W4 (SPEC 3): canvas rect + rem at each viewport, plus keyboard-freeze. Run: node apps/web/test/core/geometry.mjs [baseUrl]
import puppeteer from "puppeteer-core";
const base = process.argv[2] ?? "http://localhost:5188";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const cases = [
  { w: 1440, h: 900, exp: [0, 45, 1440, 810], rem: 25.92, cls: "landscape" },
  { w: 1920, h: 1080, exp: [0, 0, 1920, 1080], rem: 34.56, cls: "landscape" },
  { w: 1300, h: 813, exp: [0, 40.9, 1300, 731.25], rem: 23.4, cls: "landscape" },
  { w: 1024, h: 768, exp: [0, 96, 1024, 576], rem: 18.432, cls: "landscape" },
  { w: 768, h: 1024, ua: IPAD, mobile: true, exp: [99.6, 0, 568.9, 1024], rem: 32.768, cls: "portrait" },
  { w: 390, h: 844, ua: IPHONE, mobile: true, exp: [0, 71, 390, 702], rem: 22.464, cls: "portrait" },
  { w: 360, h: 740, ua: IPHONE, mobile: true, exp: [0, 46, 360, 648], rem: 20.736, cls: "portrait" },
  { w: 430, h: 932, ua: IPHONE, mobile: true, exp: [0, 79, 430, 774], rem: 24.768, cls: "portrait" },
  { w: 375, h: 667, ua: IPHONE, mobile: true, exp: [2.2, 0, 370.6, 667], rem: 21.344, cls: "portrait" },
  { w: 844, h: 390, ua: IPHONE, mobile: true, land: true, exp: [75.3, 0, 693.3, 390], rem: 12.48, cls: "landscape" }
];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
let fail = 0;
for (const c of cases) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  if (c.ua) await page.setUserAgent(c.ua);
  await page.setViewport({ width: c.w, height: c.h, isMobile: !!c.mobile, hasTouch: !!c.mobile, isLandscape: !!c.land, deviceScaleFactor: 1 });
  await page.goto(`${base}/games/ptlmock?mock=preflop-your-turn`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#canvas");
  await new Promise((r) => setTimeout(r, 400));
  const m = await page.evaluate(() => {
    const r = document.getElementById("canvas").getBoundingClientRect();
    return { r: [r.x, r.y, r.width, r.height], rem: parseFloat(getComputedStyle(document.documentElement).fontSize), cls: document.documentElement.className, zoom: getComputedStyle(document.documentElement).getPropertyValue("--table-design-system-zoom") };
  });
  const okRect = m.r.every((v, i) => Math.abs(v - c.exp[i]) <= 1);
  const okRem = Math.abs(m.rem - c.rem) / c.rem <= 0.01;
  const okCls = m.cls.split(" ").includes(c.cls);
  const ok = okRect && okRem && okCls;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.w}x${c.h}${c.mobile ? " mobile" : ""} rect=${m.r.map((v) => v.toFixed(1))} rem=${m.rem.toFixed(3)} cls=${m.cls} zoom=${(+m.zoom).toFixed(3)} errors=${errors.length}`);
  if (errors.length) console.log("  ", errors.slice(0, 3).join(" | "));
  await page.close();
}
// keyboard freeze on mobile: focus an input while resizing the viewport, rem must not change
{
  const page = await browser.newPage();
  await page.setUserAgent(IPHONE);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${base}/games/ptlmock?mock=preflop-your-turn`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#canvas");
  await page.evaluate(() => { const i = document.createElement("input"); i.id = "probe"; document.getElementById("canvas").appendChild(i); i.focus(); });
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  await page.setViewport({ width: 390, height: 500, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 400));
  const during = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  await page.evaluate(() => document.getElementById("probe").blur());
  await new Promise((r) => setTimeout(r, 500));
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  const ok = before === during && after !== before;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} keyboard freeze before=${before} during=${during} after=${after}`);
  await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
