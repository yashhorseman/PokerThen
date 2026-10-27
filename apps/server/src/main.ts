import { engine } from "@pokerthen/engine";
import { startApp, cryptoEntropy } from "./app.js";
import { loadFixedDecks } from "./devEntropy.js";
import { loadEnv } from "./env.js";

/** Bootstrap: PORT (all interfaces), DATA_DIR, SESSION_SECRET (required in production). Graceful SIGTERM. */
const env = loadEnv();
const entropy = env.devFixedDecks ? loadFixedDecks(env.devFixedDecks) : cryptoEntropy;
if (env.devFixedDecks) console.warn(`[dev] DEV_FIXED_DECKS active: ${env.devFixedDecks}`);
else if (process.env.DEV_FIXED_DECKS) console.warn("[boot] DEV_FIXED_DECKS ignored in production");

async function main(): Promise<void> {
  const app = await startApp({ env, engine, entropy });
  console.log(`pokerthen listening on ${app.port} (data: ${env.dataDir})`);

  let stopping = false;
  const stop = (sig: string): void => {
    if (stopping) return;
    stopping = true;
    console.log(`[shutdown] ${sig}: flushing and closing`);
    const t = setTimeout(() => process.exit(0), 5000);
    t.unref();
    app.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
