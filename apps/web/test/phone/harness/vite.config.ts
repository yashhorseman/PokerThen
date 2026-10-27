import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../../src");

/** W6-only harness: replace W4's core/hooks + core/ui (imported by src/actions via ./deps) with mocks. */
function mockCore(): Plugin {
  return {
    name: "w6-mock-core",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;
      const imp = importer.replace(/\\/g, "/");
      if (!imp.includes("/apps/web/src/")) return null;
      const target = path.resolve(path.dirname(imp), source).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      if (target === src + "/core/hooks") return path.resolve(here, "mockHooks.tsx");
      if (target === src + "/menus" || target === src + "/menus/index") return path.resolve(here, "mockMenus.tsx");
      if (target === src + "/core/ui" && imp.includes("/src/actions/")) return path.resolve(here, "mockUi.tsx");
      return null;
    }
  };
}

export default defineConfig({
  root: here,
  plugins: [mockCore(), react()],
  server: { port: 5199, strictPort: true, fs: { allow: [path.resolve(here, "../../../../..")] } },
  resolve: { alias: { "@w6src": src } },
  cacheDir: path.resolve(here, "../../../../../research-scratch/vite-w6")
});
