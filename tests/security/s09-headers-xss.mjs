// (9) security headers / CSP on every kind of response, CSP violations and HTML-injection rendering in the REAL client (headless Chrome), static-file hygiene.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Peer, rawHttp, startServer, makeTable, sleep, TMP } from "./lib/harness.mjs";
import { ok, defect, info, section, finish } from "./lib/t.mjs";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

section("response headers (test mode and production mode)");
for (const mode of ["test", "production"]) {
  const S = await startServer({ rotateIp: true, env: mode === "production" ? { NODE_ENV: "production" } : {} });
  const T = await makeTable(S, ["Ann", "Bo"]);
  const routes = [["html /", "/"], ["html /games/:id", `/games/${T.gameId}`], ["asset", "/assets/" + (await rawHttp(S, { path: "/" })).text.match(/assets\/[^"]+\.js/)?.[0].replace("assets/", "")], ["api healthz", "/healthz"], ["api 403", `/games/${T.gameId}/players_sessions`], ["404", "/nope.txt"], ["api log 400", `/api/games/${T.gameId}/log_v3?hand_number=x`], ["302 unknown game", "/games/ptlnotagame000000000000"]];
  for (const [label, path] of routes) {
    const r = await rawHttp(S, { path, headers: label.includes("403") ? {} : { cookie: T.owner.cookie } });
    const h = r.headers; const csp = h["content-security-policy"] ?? "";
    ok(`[${mode}] ${label} (${r.status}): nosniff + referrer-policy + CSP present`, h["x-content-type-options"] === "nosniff" && h["referrer-policy"] === "same-origin" && /default-src 'self'/.test(csp), JSON.stringify({ nosniff: h["x-content-type-options"], ref: h["referrer-policy"], csp: csp.slice(0, 40) }));
  }
  const r = await rawHttp(S, { path: "/", headers: { host: "poker.example.com" } });
  const csp = r.headers["content-security-policy"];
  ok(`[${mode}] CSP: frame-ancestors 'none', object-src 'none', base-uri 'self', form-action 'self', no 'unsafe-eval', no inline scripts, no wildcard`, /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /form-action 'self'/.test(csp) && !/unsafe-eval|script-src[^;]*unsafe-inline|\s\*[\s;]/.test(csp), csp);
  if (mode === "production") ok("[production] connect-src allows only 'self' and wss://<host> (no ws:// and no localhost)", /connect-src 'self' wss:\/\/poker\.example\.com(;|$)/.test(csp), csp.match(/connect-src[^;]*/)?.[0] ?? "");
  else info("[test] CSP also allows ws://localhost:* (dev only, removed in production)", csp.match(/connect-src[^;]*/)?.[0] ?? "");
  const hsts = r.headers["strict-transport-security"];
  if (mode === "production") defect("c-prod-hardening.hsts", "c-prod-hardening", !!hsts, "no Strict-Transport-Security header (Azure 'HTTPS only' redirects, but the browser is never told to stay on https)");
  const etc = ["x-powered-by", "server"].filter((k) => r.headers[k]);
  ok(`[${mode}] no X-Powered-By / Server banner`, etc.length === 0, etc.join(","));
  const api = await rawHttp(S, { path: "/healthz" }); ok(`[${mode}] API responses are no-store`, /no-store/.test(api.headers["cache-control"] ?? ""), api.headers["cache-control"]);
  const html = await rawHttp(S, { path: "/" }); ok(`[${mode}] HTML is no-cache; hashed assets are immutable`, /no-cache/.test(html.headers["cache-control"] ?? ""), html.headers["cache-control"]);
  if (mode === "test") {
    const a = html.text.match(/assets\/[^"]+\.js/)?.[0]; const as = await rawHttp(S, { path: "/" + a }); ok("hashed asset: public, max-age=31536000, immutable", /immutable/.test(as.headers["cache-control"]), as.headers["cache-control"]);
    const map = await rawHttp(S, { path: "/" + a + ".map" }); ok("no source maps are served", map.status === 404, `${map.status}`);
    const ds = await rawHttp(S, { path: "/.DS_Store" }); ok("no .DS_Store / dotfiles served", ds.status === 404, `${ds.status}`);
    ok("index.html has no inline script (CSP-compatible)", !/<script(?![^>]*\ssrc=)[^>]*>[^<]/i.test(html.text), "");
  }
  await S.stop();
}

section("real client in headless Chrome: CSP violations and HTML-injection rendering");
if (!existsSync(CHROME)) info("browser part skipped", "Chrome not found at " + CHROME);
else {
  const puppeteer = (await import("puppeteer-core")).default;
  const S = await startServer({ rotateIp: true });
  const payloadNames = ["<svg onload=1>", "\"><img src=x>", "<b>bold</b>x"];
  const T = await makeTable(S, [payloadNames[0], payloadNames[1], payloadNames[2]]);
  const payloads = ["<img src=x onerror=\"window.__xss=1\">", "<script>window.__xss=2</script>", "<svg/onload=window.__xss=3>", "javascript:window.__xss=4", "&lt;b&gt;entity&lt;/b&gt; ${7*7} {{7*7}}"];
  for (const [i, p] of payloads.entries()) { T.conns[i % 3].chat(p); await sleep(1100); }
  await T.owner.post(`/games/${T.gameId}/start-game`, {});
  await sleep(1500);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const msgs = []; page.on("console", (m) => msgs.push(`${m.type()}: ${m.text()}`)); page.on("pageerror", (e) => msgs.push("pageerror: " + e.message));
  await page.evaluateOnNewDocument(() => { window.__xss = undefined; });
  await page.goto(`${S.base}/games/${T.gameId}`, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await sleep(2500);
  // open the chat dock if collapsed
  await page.evaluate(() => { const b = document.querySelector(".chat, [class*=chat] button, .chat-btn"); if (b) b.dispatchEvent(new MouseEvent("click", { bubbles: true })); }).catch(() => {});
  await sleep(800);
  const dom = await page.evaluate(() => ({
    xss: window.__xss, injectedImg: document.querySelectorAll("img[src='x']").length, injectedScript: [...document.scripts].filter((s) => !s.src).length, onload: document.querySelectorAll("[onload],[onerror],[onclick]").length,
    text: document.body.innerText, boldTag: document.querySelectorAll("b").length
  }));
  await page.screenshot({ path: join(TMP, "xss-table.png") });
  const csp = msgs.filter((m) => /Content Security Policy|Refused to/i.test(m));
  ok("no CSP violation while loading the table page", csp.length === 0, csp.slice(0, 3).join(" | "));
  ok("no script ran from chat or nicknames (window.__xss undefined)", dom.xss === undefined, String(dom.xss));
  ok("no <img src=x>, no inline <script>, no on* attributes were injected into the DOM", dom.injectedImg === 0 && dom.injectedScript === 0 && dom.onload === 0, JSON.stringify({ img: dom.injectedImg, script: dom.injectedScript, on: dom.onload }));
  const shown = payloadNames.filter((n) => dom.text.includes(n)).length + payloads.filter((p) => dom.text.includes(p)).length;
  info("payload text visible as TEXT in the page", `${shown} of ${payloadNames.length + payloads.length} payloads appear literally in innerText (escaped); screenshot ${join(TMP, "xss-table.png")}`);
  ok("nickname '<b>bold</b>x' is not interpreted as markup", dom.boldTag === 0 || !dom.text.includes("bold</b>") === false, `b elements=${dom.boldTag}`);
  info("console", msgs.filter((m) => !/favicon|Failed to load resource: the server responded with a status of 4/.test(m)).slice(0, 6).join(" | "));
  await browser.close();
  await S.stop();
}
finish("s09-headers-xss");
