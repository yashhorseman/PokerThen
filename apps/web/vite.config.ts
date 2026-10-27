import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// W4 owns this file. Output is picked up by scripts/build.mjs (dist/app/public).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/ws": { target: "ws://localhost:3000", ws: true }, "/api": "http://localhost:3000", "/games": {
        target: "http://localhost:3000",
        // the HTML shell for /games/:id is served by Vite (SPA); API calls under it are proxied
        bypass: (req) => (req.method === "GET" && /^\/games\/[^/?]+\/?(\?.*)?$/.test(req.url ?? "") && (req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined)
      }, "/new-game": "http://localhost:3000", "/current-player-infos": "http://localhost:3000", "/healthz": "http://localhost:3000" } },
  build: { outDir: "../../dist/app/public", emptyOutDir: true, target: "es2022" }
});
