import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: [{ find: /^\.\/deps$/, replacement: path.join(here, "stubDeps.tsx") }]
  },
  server: { fs: { allow: [path.join(here, "../../../../..")] } }
});
