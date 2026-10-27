// Builds (unless --no-build) and zips dist/app -> dist/app.zip. It does NOT deploy. Deploy only when the owner asks:
//   az webapp deploy -g pokerthen-rg -n pokerthen-yash --src-path dist/app.zip --type zip
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv.includes("--no-build")) execFileSync("node", [resolve(root, "scripts/build.mjs")], { stdio: "inherit" });

const app = resolve(root, "dist/app");
const zip = resolve(root, "dist/app.zip");
if (!existsSync(resolve(app, "server.cjs"))) throw new Error("dist/app/server.cjs missing; run npm run build");
rmSync(zip, { force: true });
execFileSync("zip", ["-qr", zip, ".", "-x", "*.DS_Store"], { cwd: app, stdio: "inherit" });
console.log(`wrote ${zip} (${(statSync(zip).size / 1024).toFixed(0)} KiB)`);
console.log("NOT deployed. When the owner asks: az webapp deploy -g pokerthen-rg -n pokerthen-yash --src-path dist/app.zip --type zip");
