import puppeteer from "puppeteer-core";
const out = "research-scratch/shots/w8/";
const vps = [["d1440", 1440, 900, false], ["d1024", 1024, 768, false], ["p390", 390, 844, true]];
const pages = ["home", "newgame", "newgame-error", "connecting", "tutorial", "verify"];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const [n, w, h, mob] of vps) {
  for (const p of pages) {
    const pg = await b.newPage();
    await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mob, hasTouch: mob });
    pg.on("pageerror", (e) => console.log("ERR", p, n, e.message));
    pg.on("console", (m) => m.type() === "error" && console.log("CONSOLE", p, n, m.text()));
    await pg.goto(`http://localhost:5188/?page=${p}${mob ? "&portrait=1" : ""}`, { waitUntil: "networkidle0" });
    if (p === "newgame-error") { await pg.type("input", "x"); await pg.click(".pt-create-btn"); await new Promise((r) => setTimeout(r, 300)); }
    if (p.startsWith("newgame") && n === "d1440") {
      const m = await pg.evaluate(() => { const r = document.querySelector(".waiting-container-center-container").getBoundingClientRect(); const c = document.querySelector("#canvas").getBoundingClientRect(); const i = document.querySelector("input")?.getBoundingClientRect(); const bt = document.querySelector(".pt-create-btn")?.getBoundingClientRect(); return { card: [r.x, r.y, r.width, r.height].map(Math.round), canvas: [c.x, c.y, c.width, c.height].map(Math.round), rem: getComputedStyle(document.documentElement).fontSize, input: i && [i.width, i.height], btn: bt && [bt.width, bt.height] }; });
      console.log(p, JSON.stringify(m));
    }
    await pg.screenshot({ path: `${out}${p}-${n}.png`, fullPage: p === "tutorial" || p === "home" });
    await pg.close();
  }
}
await b.close();
