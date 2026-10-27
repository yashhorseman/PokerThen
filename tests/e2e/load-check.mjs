// INTEGRATION load check with the REAL engine: 5 tables x 10 sockets; seats 4 players per table and starts hands. Prints RSS + idle CPU.
import { execSync } from "node:child_process";
import { WebSocket } from "ws";
import { startServer } from "./harness/server.mjs";
import { sleep } from "./harness/index.mjs";

const srv = await startServer({ env: { TRUST_PROXY: "1" } });
let ipN = 1;
const pid = srv.proc.pid;
const rss = () => Number(execSync(`ps -o rss= -p ${pid}`).toString().trim()) / 1024;
const cpuTime = () => execSync(`ps -o time= -p ${pid}`).toString().trim();
const jar = async (path = "/current-player-infos") => { const r = await fetch(srv.url + path, { headers: { origin: srv.url, "x-forwarded-for": `10.1.0.${ipN++ % 250}` } }); const ck = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "); return { ck, json: await r.json().catch(() => null) }; };
const call = async (ck, method, path, body) => { const r = await fetch(srv.url + path, { method, headers: { origin: srv.url, "x-forwarded-for": "10.2.0.1", cookie: ck, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, text: await r.text() }; };
console.log("baseline RSS MB", rss().toFixed(1));
const socks = [];
let frames = 0;
for (let t = 0; t < 5; t++) {
  const owner = await jar(); const r = await call(owner.ck, "POST", "/new-game", { playerName: "Own" + t, gM: "th", playerStack: 1000, bigBlind: 20, smallBlind: 10, cM: false });
  const gid = JSON.parse(r.text).gameID;
  const guests = [];
  for (let i = 0; i < 9; i++) guests.push(await jar());
  const all = [owner, ...guests];
  for (const [i, p] of all.entries()) {
    const ws = new WebSocket(`${srv.url.replace("http", "ws")}/ws?gameID=${gid}&layout=d`, { headers: { origin: srv.url, cookie: p.ck, "x-forwarded-for": `10.0.${t}.${i + 1}` } });
    ws.on("message", () => frames++);
    await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
    socks.push(ws);
    p.ws = ws;
  }
  await sleep(300);
  for (let i = 1; i <= 3; i++) {
    const info = JSON.parse((await call(guests[i].ck, "GET", "/current-player-infos")).text);
    const ri = await call(guests[i].ck, "POST", `/games/${gid}/request_ingress`, { seat: i + 1, playerName: "G" + i, allowSpectator: false, stack: 1000 }); if (ri.status !== 200) console.log("ingress", t, i, ri.status, ri.text);
    const ap = await call(owner.ck, "POST", `/games/${gid}/approve_player`, { playerID: info.id }); if (ap.status !== 200) console.log("approve", t, i, ap.status, ap.text);
  }
  console.log("table", t, "start", (await call(owner.ck, "POST", `/games/${gid}/start-game`, {})).status);
}
await sleep(5000);
console.log("sockets", socks.length, "frames", frames, "RSS MB (active)", rss().toFixed(1));
const t0 = cpuTime(); await sleep(20000); const t1 = cpuTime();
console.log("cpu time before/after 20 s idle-ish:", t0, t1, "RSS MB", rss().toFixed(1));
socks.forEach((s) => s.close());
await srv.dispose();
