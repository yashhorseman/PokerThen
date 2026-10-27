// Harness self-test: real server process, a real Chrome context, cookie + page load + health. Needs no game engine.
import { assert } from "./index.mjs";

export const options = { allowConsoleErrors: true }; // web build may be absent (404/503 resources)

export default async function (h) {
  const a = await h.player("Alice");
  await a.open("/home");
  const ck = await a.cookie();
  assert(ck && ck.length === 50, "ptn cookie is a 50-char token");
  const health = await a.api("GET", "/healthz");
  assert(health.json?.ok === true, "healthz ok");
  const cookies = await a.page.cookies(h.url);
  const c = cookies.find((x) => x.name === "ptn");
  assert(c.httpOnly && c.sameSite === "Lax" && c.path === "/", "cookie flags HttpOnly/SameSite=Lax/Path=/");
  const evil = await fetch(h.url + "/new-game", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json", cookie: `ptn=${ck}` }, body: JSON.stringify({ playerName: "Mallory" }) });
  assert(evil.status === 403, "forged Origin rejected with 403 (got " + evil.status + ")");
  await h.restartServer({ crash: true });
  const again = await a.api("GET", "/current-player-infos");
  assert(again.json?.id, "identity survives a server crash/restart (cookie-derived id)");
}
