import { fixtures } from "@pokerthen/shared/fixtures";
import { HttpApi } from "../api/client";
import { GameRuntime } from "../runtime";
import { MockServer } from "./MockServer";

/**
 * Dev/test only: `/games/<id>?mock=<fixtureName>` runs the table against a scripted server built from a W1 Frame
 * fixture. Extra: `&orient=...` is not needed (orientation follows the viewport). `window.__mock` exposes the server
 * (`push(frame)`, `received`) so UI developers/puppeteer can script transitions.
 */
export function createMockRuntime(gameId: string, fixtureName: string): GameRuntime {
  const frame = fixtures[fixtureName] ?? fixtures["waiting-2-players"]!;
  const server = new MockServer(frame);
  (globalThis as unknown as { __mock: unknown }).__mock = { server, fixtures };
  const http = new HttpApi(gameId, {
    fetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
    reload: () => undefined,
    timeoutMs: 1000
  });
  return new GameRuntime({ gameId, createSocket: server.createSocket, buildUrl: (q) => `mock://ws?${q}`, http, persistPrefs: false });
}
