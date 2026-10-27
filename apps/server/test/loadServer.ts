// Child process for scripts-free load measurement: real server code + fake engine. `tsx apps/server/test/loadServer.ts`
import { startApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";
import { LIMITS } from "../src/limits.js";
import { fakeEngine } from "./fakeEngine.js";
(LIMITS as { MAX_SOCKETS_PER_IP: number }).MAX_SOCKETS_PER_IP = 1000; // all load clients share 127.0.0.1
const app = await startApp({ env: loadEnv({ NODE_ENV: "test", PORT: process.env.PORT ?? "0", DATA_DIR: process.env.DATA_DIR! } as NodeJS.ProcessEnv), engine: fakeEngine, log: () => {} });
console.log("PORT " + app.port);
