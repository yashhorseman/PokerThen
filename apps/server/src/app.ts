import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { EngineApi, Entropy } from "@pokerthen/shared";
import { noProfanityFilter, type ProfanityFilter } from "./chat/chat.js";
import type { Env } from "./env.js";
import { createHandler } from "./http/router.js";
import { nodeFs, type DurableFs } from "./persistence/fsio.js";
import { Registry } from "./tables/registry.js";
import { Hub } from "./ws/hub.js";

export interface AppOptions {
  env: Env;
  engine: EngineApi;
  entropy?: Entropy;
  clock?: () => number;
  fs?: DurableFs;
  profanity?: ProfanityFilter;
  log?: (msg: string, err?: unknown) => void;
}

export interface RunningApp {
  server: Server;
  registry: Registry;
  hub: Hub;
  port: number;
  /** graceful: stop accepting, close sockets with 1001, state is already durable (sync pipeline) */
  close(): Promise<void>;
  /** test helper: simulate a crash (no goodbye, timers dead, sockets dropped) */
  crash(): Promise<void>;
}

export const cryptoEntropy: Entropy = (n) => new Uint8Array(randomBytes(n));

export async function startApp(opts: AppOptions): Promise<RunningApp> {
  const clock = opts.clock ?? Date.now;
  const log = opts.log ?? ((m, e) => console.error(m, e ?? ""));
  const registry = new Registry({
    engine: opts.engine,
    entropy: opts.entropy ?? cryptoEntropy,
    clock,
    fs: opts.fs ?? nodeFs,
    dataDir: opts.env.dataDir,
    profanity: opts.profanity ?? noProfanityFilter,
    log
  });
  const rep = registry.load();
  log(`[boot] data dir ${opts.env.dataDir}: ${rep.loaded} table(s) recovered, ${rep.quarantined} quarantined, ${rep.droppedLines} uncommitted line(s) dropped`);
  const server = createServer(createHandler({ env: opts.env, engine: opts.engine, registry, clock, log, startedAt: clock() }));
  server.keepAliveTimeout = 65_000; // Azure front end idles at 240 s; keep ours above typical client reuse
  const hub = new Hub(server, opts.env, registry, clock, log);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.env.port, "0.0.0.0", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  let closed = false;
  const shutdown = async (graceful: boolean): Promise<void> => {
    if (closed) return;
    closed = true;
    registry.disposeAll();
    if (graceful) hub.closeAll(1001); else hub.terminateAll();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
      setTimeout(resolve, 2000).unref();
    });
    hub.closeAll(1001);
  };
  return { server, registry, hub, port, close: () => shutdown(true), crash: () => shutdown(false) };
}
