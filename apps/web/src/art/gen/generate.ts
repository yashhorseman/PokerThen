/* Generates public/art/*. Run: npx tsx apps/web/src/art/gen/generate.ts  (PNG output needs Google Chrome) */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cardBackSvg } from "../svg/cardBack";
import { feltSvg } from "../svg/felt";
import { iconMaster, logoFull, logoMarkSvg } from "../svg/logo";
import { discSvg, placeholderSvg, roomTileSvg } from "../svg/misc";
import { PALETTE as P } from "../palette";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../public/art");
mkdirSync(out, { recursive: true });
const w = (name: string, s: string) => writeFileSync(resolve(out, name), s);

w("card-back.svg", cardBackSvg());
w("felt-desktop.svg", feltSvg("desktop"));
w("felt-desktop-red.svg", feltSvg("desktop", true));
w("felt-phone.svg", feltSvg("phone"));
w("felt-phone-red.svg", feltSvg("phone", true));
w("room.svg", roomTileSvg());
w("dealer.svg", discSvg("dealer"));
w("straddle.svg", discSvg("straddle"));
w("placeholder-desktop.svg", placeholderSvg("desktop"));
w("placeholder-phone.svg", placeholderSvg("phone"));
w("logo.svg", logoFull("dark").replace("<svg ", '<svg ').replace(/font-family="[^"]*"/g, `font-family="'Helvetica Neue', Arial, sans-serif"`));
w("logo-mark.svg", logoMarkSvg(64));
w("favicon.svg", iconMaster());

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (existsSync(chrome)) {
  const pp = await import("puppeteer-core");
  const browser = await pp.default.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage();
  const fontCss = (wt: number) => `@font-face{font-family:Mulish;font-weight:${wt};src:url(file://${resolve(here, `../../../../../node_modules/@fontsource/mulish/files/mulish-latin-${wt}-normal.woff2`)})}`;
  async function png(name: string, w_: number, h_: number, html: string) {
    await page.setViewport({ width: w_, height: h_, deviceScaleFactor: 1 });
    await page.setContent(`<style>${fontCss(300)}${fontCss(900)}html,body{margin:0;background:transparent}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(out, name), omitBackground: true, clip: { x: 0, y: 0, width: w_, height: h_ } });
  }
  const sized = (svg: string, s: number) => `<div style="width:${s}px;height:${s}px">${svg.replace('width="64" height="64"', `width="${s}" height="${s}"`)}</div>`;
  await png("favicon.png", 60, 60, sized(iconMaster(), 60));
  await png("apple-touch-icon.png", 180, 180, `<div style="width:180px;height:180px;background:${P.plumDeep}">${sized(iconMaster(), 180).replace("rx=\"14\"", "rx=\"0\"")}</div>`);
  await png(
    "og-image.png", 1200, 630,
    `<div style="position:relative;width:1200px;height:630px;background:${P.room};overflow:hidden;font-family:Mulish,sans-serif">
      <div style="position:absolute;left:560px;top:90px;width:760px;height:360px">${feltSvg("desktop").replace("<svg ", '<svg width="760" height="359" ')}</div>
      <div style="position:absolute;left:70px;top:150px;width:520px">
        <div style="width:520px;height:121px">${logoFull("dark").replace('width="120" height="28"', 'width="520" height="121"')}</div>
        <div style="margin-top:34px;color:${P.cream};font-size:44px;font-weight:900;line-height:1.1">Private poker with friends.</div>
        <div style="margin-top:18px;color:#bbb;font-size:26px;font-weight:300">Free. No download. No registration.</div>
      </div></div>`
  );
  await browser.close();
} else console.warn("Chrome not found: skipped PNG output");
console.log("art written to", out);
