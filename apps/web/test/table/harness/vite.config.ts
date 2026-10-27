import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
// Replaces sibling entry points with mocks so the table can be developed in isolation (throwaway dev harness).
export default defineConfig({
  root: here("."),
  publicDir: here("../../../public"),
  plugins: [react()],
  server: { fs: { strict: false } },
  resolve: {
    alias: [
      { find: /^\.\.\/core\/hooks$/, replacement: here("./mockHooks.tsx") },
      { find: /^\.\.\/core\/ui$/, replacement: here("./mockUi.tsx") },
      { find: /^\.\.\/menus$/, replacement: here("./mockMenus.tsx") },
      { find: "@pokerthen/shared", replacement: here("../../../../../packages/shared/src/index.ts") }
    ]
  }
});
