// Dev: server (tsx watch, :3000) + vite (:5173, proxies /ws and the HTTP API to :3000).
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = (n) => resolve(root, "node_modules/.bin", n);
const env = { ...process.env, PORT: process.env.PORT ?? "3000", DATA_DIR: process.env.DATA_DIR ?? resolve(root, ".data"), NODE_ENV: "development", DEV_ORIGINS: "http://localhost:5173" };

const procs = [
  spawn(bin("tsx"), ["watch", "--clear-screen=false", resolve(root, "apps/server/src/main.ts")], { stdio: "inherit", env }),
  spawn(bin("vite"), ["--config", resolve(root, "apps/web/vite.config.ts"), resolve(root, "apps/web")], { stdio: "inherit", env })
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", () => stop()));
