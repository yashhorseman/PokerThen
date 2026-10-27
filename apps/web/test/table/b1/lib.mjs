// B1 desktop QA helpers: real server + real browsers. Run from repo root: node apps/web/test/table/b1/<script>.mjs
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHarness, sleep, waitFor, assert } from "../../../../../tests/e2e/harness/index.mjs";
import { setupTable, clickBtn, whoseTurn, act, bodyText, yourTurn, gotIt } from "../../../../../tests/e2e/harness/ui.mjs";
export { sleep, waitFor, assert, clickBtn, whoseTurn, act, bodyText, yourTurn, gotIt, setupTable };
export const OUT = fileURLToPath(new URL("../../../../../research-scratch/shots/b1/", import.meta.url));
mkdirSync(OUT, { recursive: true });
export const NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Gina", "Hank", "Iris", "Jack"];

/** n players, owner = Alice seat 1, seats given by `seats` (default 1..n). viewport for every browser. */
export async function session({ n = 3, w = 1440, h: vh = 900, opts = {}, seats, config = {}, start = true } = {}) {
  const h = await createHarness(opts);
  h.shotDir = OUT;
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(await h.player(NAMES[i], { width: w, height: vh }));
  const seatNos = seats ?? ps.map((_, i) => i + 1);
  const gid = await setupTable(h, ps[0], ps.slice(1).map((p, i) => [p, seatNos[i + 1], p.name]));
  if (Object.keys(config).length) {
    const cfg = (await ps[0].api("GET", `/games/${gid}/current_or_next_configs`)).json; delete cfg.queued;
    const r = await ps[0].api("POST", `/games/${gid}/update_game`, { ...cfg, ...config });
    assert(r.status === 200, "config " + r.text);
  }
  if (start) await clickBtn(ps[0], /start game/i);
  return { h, ps, gid, byName: Object.fromEntries(ps.map((p) => [p.name, p])) };
}
export const shot = async (p, name, tag = "") => { const f = join(OUT, `${name}${tag}.png`); await p.page.screenshot({ path: f }); return f; };

/** install a MutationObserver recorder in a page: records class changes + child add/remove with performance.now */
export async function record(p) {
  await p.page.evaluate(() => {
    window.__rec = []; window.__t0 = performance.now();
    const d = (e) => (e.nodeType === 1 ? (e.className && e.className.baseVal === undefined ? e.className : "") + (e.tagName ? "<" + e.tagName.toLowerCase() + ">" : "") : "#text");
    const mo = new MutationObserver((ms) => { const t = performance.now(); for (const m of ms) {
      if (m.type === "attributes") window.__rec.push({ t, k: "attr", c: d(m.target), to: m.target.className?.toString?.() ?? "", p: m.target.closest?.(".table-player")?.className?.match(/table-player-\d+/)?.[0] });
      else { for (const a of m.addedNodes) if (a.nodeType === 1) window.__rec.push({ t, k: "add", c: d(a), txt: (a.textContent ?? "").slice(0, 40) }); for (const a of m.removedNodes) if (a.nodeType === 1) window.__rec.push({ t, k: "rem", c: d(a), txt: (a.textContent ?? "").slice(0, 40) }); }
    } });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
}
export const recDump = (p) => p.page.evaluate(() => window.__rec);
