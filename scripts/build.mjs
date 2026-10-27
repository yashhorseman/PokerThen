// Build everything into dist/app: server.cjs (esbuild bundle), public/ (vite), package.json. Never touches Azure.
import { build as esbuild } from "esbuild";
import { build as vite } from "vite";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist/app");

// --server-only: rebuild just server.cjs + package.json and keep an existing dist/app/public (useful while the web app is in flux)
const serverOnly = process.argv.includes("--server-only");
if (!serverOnly) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await esbuild({
  entryPoints: [resolve(root, "apps/server/src/main.ts")],
  outfile: resolve(out, "server.cjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  external: ["bufferutil", "utf-8-validate"], // optional ws accelerators; ws falls back to JS
  logLevel: "info"
});

if (!serverOnly) {
  await vite({ root: resolve(root, "apps/web"), configFile: resolve(root, "apps/web/vite.config.ts"), logLevel: "info" });
}

writeFileSync(
  resolve(out, "package.json"),
  JSON.stringify({ name: "pokerthen", version: "0.1.0", private: true, scripts: { start: "node server.cjs" }, engines: { node: ">=22" } }, null, 2) + "\n"
);

if (!existsSync(resolve(out, "server.cjs")) || !existsSync(resolve(out, "public/index.html"))) {
  console.error("build incomplete: server.cjs or public/index.html missing");
  process.exit(1);
}
console.log("built", out);
