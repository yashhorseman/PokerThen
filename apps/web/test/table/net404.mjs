import { start } from "./lib.mjs";
const { browser, url, close } = await start();
const p = await browser.newPage();
p.on("response", (r) => { if (r.status() >= 400) console.log(r.status(), r.url()); });
await p.goto(url, { waitUntil: "networkidle0" });
await close();
