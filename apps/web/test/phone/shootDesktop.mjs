/** Desktop (landscape) screenshots of the action area at 1440x900 and 1024x768. */
import fs from "node:fs";
import { launch, open } from "./lib.mjs";
const OUT = new URL("../../../../research-scratch/shots/w6/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sizes = [{ name: "1440x900", w: 1440, h: 900 }, { name: "1024x768", w: 1024, h: 768 }];
const scenarios = ["offturn-callpre", "offturn-checkorfold", "turn-facing-bet", "turn-free-check", "turn-timebank", "allin-call", "rit", "showhand", "away", "cancel-ingress"];
const browser = await launch();
for (const s of sizes) for (const sc of scenarios) {
  const page = await open(browser, { ...s, scenario: sc, orient: "landscape", mobile: false });
  await page.screenshot({ path: `${OUT}desktop-${s.name}-${sc}.png` });
  if (sc.startsWith("turn-")) {
    await page.click(".action-button.raise");
    await new Promise((r) => setTimeout(r, 200));
    await page.screenshot({ path: `${OUT}desktop-${s.name}-${sc}-raise.png` });
  }
  await page.close();
}
await browser.close();
console.log("done");
