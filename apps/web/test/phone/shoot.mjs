import fs from "node:fs";
import { launch, open, PHONES, rect } from "./lib.mjs";
const OUT = new URL("../../../../research-scratch/shots/w6/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const scenarios = (process.argv[2] ?? "offturn-callpre,offturn-checkorfold,turn-facing-bet,turn-free-check,turn-timebank,allin-call,rit,showhand,away,result-away-showhand,cancel-ingress,flop").split(",");
const phones = process.argv[3] ? PHONES.filter((p) => process.argv[3].split(",").includes(p.name)) : PHONES.slice(0, 1);
const browser = await launch();
for (const p of phones) {
  for (const s of scenarios) {
    const page = await open(browser, { ...p, scenario: s });
    await page.screenshot({ path: `${OUT}phone-${p.name}-${s}.png` });
    if (s.startsWith("turn-") && s !== "turn-free-check" || s === "turn-free-check") {
      await page.click(".action-button.raise");
      await new Promise((r) => setTimeout(r, 200));
      await page.screenshot({ path: `${OUT}phone-${p.name}-${s}-raise.png` });
    }
    await page.close();
  }
}
await browser.close();
console.log("done", OUT);
