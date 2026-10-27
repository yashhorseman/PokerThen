import { resolve } from "node:path";

export interface Env {
  port: number;
  dataDir: string;
  isProd: boolean;
  sessionSecret: string;
  allowedOrigins: string[];
  devOrigins: string[];
  /** trust X-Forwarded-* (Azure App Service or TRUST_PROXY=1) */
  trustProxy: boolean;
  /** explicit static dir override (PUBLIC_DIR) */
  publicDir: string | null;
  /** dev only: JSON file of scripted decks (ignored in production) */
  devFixedDecks: string | null;
  /** dev only: base url of the vite dev server used when dist/app/public/index.html is missing */
  devViteUrl: string;
}

const list = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);

export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env {
  const onAzure = !!src.WEBSITE_SITE_NAME;
  // SECURITY (Phase C): App Service always sets WEBSITE_SITE_NAME; a forgotten NODE_ENV there must not fall back to the public dev secret / DEV_FIXED_DECKS / DEV_ORIGINS.
  const isProd = src.NODE_ENV === "production" || (onAzure && src.NODE_ENV !== "development");
  if (isProd && !src.SESSION_SECRET) throw new Error("SESSION_SECRET is required when NODE_ENV=production");
  return {
    port: Number(src.PORT ?? 3000),
    dataDir: resolve(src.DATA_DIR ?? (onAzure ? "/home/data" : "./.data")),
    isProd,
    sessionSecret: src.SESSION_SECRET ?? "dev-secret-not-for-production",
    allowedOrigins: list(src.ALLOWED_ORIGINS),
    devOrigins: isProd ? [] : list(src.DEV_ORIGINS),
    trustProxy: onAzure || src.TRUST_PROXY === "1",
    publicDir: src.PUBLIC_DIR ? resolve(src.PUBLIC_DIR) : null,
    devFixedDecks: !isProd && src.DEV_FIXED_DECKS ? resolve(src.DEV_FIXED_DECKS) : null,
    devViteUrl: src.DEV_VITE_URL ?? "http://localhost:5173"
  };
}
