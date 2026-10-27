# @pokerthen/server (W3)

Node 22 HTTP + WebSocket server. Single instance, in-memory authoritative tables with synchronous durable persistence.

- Env: `PORT` (all interfaces), `DATA_DIR` (default `/home/data` on Azure via `WEBSITE_SITE_NAME`, else `./.data`), `SESSION_SECRET` (required when `NODE_ENV=production`), `ALLOWED_ORIGINS`, `DEV_ORIGINS` (dev only), `TRUST_PROXY=1`, `PUBLIC_DIR`, `DEV_FIXED_DECKS=<json>` (ignored in production).
- Azure: App Settings `SESSION_SECRET`, WebSockets on, Always On, 1 instance, HTTPS only, startup `node server.cjs`. `npm run pack:zip` -> `dist/app.zip` (never deploys). Deploy only between games (a restart resumes hands via `resume`, but players reconnect).
- Persistence layout and write order: docs/ARCHITECTURE.md section 8. Every command: log/fairness/chat appends (fsync) -> `state.json` atomic replace (fsync + dir fsync) -> memory -> broadcast -> HTTP reply. A disk failure rejects the command with 503 and rolls the appended files back.
- Limits (placeholders U-N1): `src/limits.ts`.
- Tests: `npm test` (apps/server/test), `npm run test:e2e`, load check `npx tsx apps/server/test/load.ts`.
