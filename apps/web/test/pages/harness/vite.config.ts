import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";
const web = resolve(__dirname, "../../..");
export default defineConfig({
  root: __dirname, publicDir: resolve(web, "public"), plugins: [react()],
  resolve: { alias: { "@pokerthen/shared": resolve(web, "../../packages/shared/src/index.ts") } },
  server: { port: 5188, fs: { strict: false } }
});
