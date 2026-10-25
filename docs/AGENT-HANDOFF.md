# PokerThen — handoff for a new coding agent

You are taking over **PokerThen**, a private play-money Texas Hold'em site for a group of friends. The owner wants its table UI to be as polished as PokerNow's private-table screen. This file tells you what exists, how it is hosted on Azure, how to run, test and deploy it, and what must not break.

## 0. Ground rules
- **Replicate behaviour, layout, proportions and timings — not PokerNow's code or artwork.** Study their public private-table flow by playing a play-money room yourself and measure what you see. Do not copy their source files, images, logo, card backs, table art, icons, sounds or trademark. All artwork in this repo is original; keep it that way. The site's name is **PokerThen**.
- Never put secrets in the repo or in chat. `SESSION_SECRET` lives only in Azure app settings.
- Deploy only when the owner asks. Keep the Azure app at **one instance**.
- Do not regress the guarantees in section 6 (private cards never leave the server, verifiable shuffle, chip conservation). `npm test` must stay green.

## 1. Where things are
| What | Where |
|---|---|
| Repo | https://github.com/yashhorseman/PokerThen (branch `main`, public) |
| Live site | https://pokerthen-yash-hxeyf6g0g7bpbrh5.centralindia-01.azurewebsites.net |
| Owner's machine | macOS; project at `~/Projects/PokerThen` |
| Product spec (owner's machine only) | `~/Downloads/Private-Poker-Build-Specification.txt` (+ `frontend-notes.md`, `official-feature-notes.md`, `CONTINUE-HERE.txt`, `Private-Poker-Build-Handoff.zip`) — a product brief for a PokerNow-style private table with original artwork |
| Docs in the repo | `docs/ARCHITECTURE.md`, `docs/PRIVACY-AND-FAIRNESS.md`, `docs/IMPLEMENTATION-STATUS.md`, `docs/NEXT-STEPS.md`, `docs/UI-REFINEMENT-PLAN.md` (measured PokerNow UI findings — start here for the UI work) |

## 2. Azure hosting (everything needed to deploy)
- **Subscription:** "Azure subscription 1", id `3da7bea5-43c8-40a1-b1ae-8252398e9507`, tenant "Default Directory", signed in as the owner (ask them to run `az login`; never ask for passwords).
- **Credit:** a **new-account free trial** (~$200, expires about **2026-11-24**). After that the app stops or bills the card. The server is a plain Node bundle, so it can move to Render/Railway/Fly if the owner prefers. Remind the owner before the date; delete the resource group if they stop using it.
- **Resources:** resource group `pokerthen-rg`; App Service plan `ASP-pokerthenrg-b4b1` (Linux, **Basic B1**, 1 instance); web app `pokerthen-yash` (runtime **Node 22 LTS**, region **Central India**); default host `pokerthen-yash-hxeyf6g0g7bpbrh5.centralindia-01.azurewebsites.net`.
- **Required settings (already applied — verify, don't change casually):** Web sockets **on**; Always On **on**; HTTPS only **on**; Session affinity (ARR) **off**; exactly **1 instance**; startup command `node server.cjs`.
- **App settings:** `SESSION_SECRET` (random ≥24 chars; signs session cookies and derives the key that encrypts decks at rest — **rotating it invalidates sessions and any stored in-progress hand**), `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `WEBSITE_NODE_DEFAULT_VERSION=~22`. Application Insights settings were added automatically. Optional: `ALLOWED_ORIGINS` (extra browser origins), `DATA_DIR`.
- **Persistent data:** `/home/data` on App Service (survives restarts and deployments): `rooms/<id>.json` (one file per table; the live hand's deck+salts are AES-256-GCM sealed) and `.secret` (only used if `SESSION_SECRET` is unset).
- **Deploy:** `az login` then, from the repo root, `RG=pokerthen-rg APP=pokerthen-yash npm run deploy`. It builds the web app and the server bundle, zips `server.cjs` + `public/` + a tiny `package.json` into `.artifacts/pokerthen.zip`, runs `az webapp deploy --type zip`, then checks `/healthz`. Azure CLI 2.91 prints harmless Python `SyntaxWarning` noise.
- **Debug:** `az webapp log tail -g pokerthen-rg -n pokerthen-yash`; `curl https://<host>/healthz` (returns `{"ok":true,"rooms":N}`).
- **Constraint:** each table lives in one Node process, so never scale out or use deployment slots with traffic. A restart resumes tables from disk with a 10-second grace before any clock fires.

## 3. Run, test, build locally (Node 22+)
```bash
npm install
npm run dev:server      # API + WebSocket on :8787
npm run dev:web         # Vite on :5173, proxies /api and /ws
npm test                # 40 tests: engine, property tests, server integration
npm run typecheck
npm run build && npm start      # production bundle on :8787
BASE=http://localhost:8787 npm run e2e   # 4-browser smoke test (needs Chrome; CHROME_PATH to override)
```
Layout: `packages/engine` (pure rules), `packages/protocol` (zod command schemas + snapshot types), `apps/server` (HTTP+WS, room actor, persistence), `apps/web` (React 18 + Vite; CSS in `styles.css` (tokens, buttons, modals), `stage.css` (table), `actions.css` (buttons/bet panel), `room.css` (chrome/overlays)).

## 4. What exists
Everything in `docs/IMPLEMENTATION-STATUS.md`. In short: invite-link tables with host approval, No-Limit Hold'em (side pots, short all-in rules, run-it-twice, rabbit hunting, timers + time bank, pause/stop), ledger, session log, chat, host tools (shuffle seats, queued stack/rule changes), a PokerNow-style full-screen UI (3D-style table, fanned hole cards, turn glow + countdown, last-action bubbles, lime bet pills, hand-strength badge, bet panel, pre-select buttons, I/C/K/R/F/T shortcuts, stadium phone layout, felt themes), and client-side verification of every dealt card.

## 5. What the owner still wants (open work)
The owner says there are **many remaining UI differences from PokerNow, especially on phones**, and wants the site to feel "exactly like" it. Ask them for a concrete list/screenshots from a real phone (model + browser) and from desktop, then fix in this order: (1) phone layout and every phone interaction (the only real test is a physical device — the visible height is shorter than emulators because of browser chrome), (2) animation timing and polish, (3) remaining features in `docs/NEXT-STEPS.md` (hand replayer, blind levels, Omaha, bomb pots, etc.), (4) optional social features (emoji reactions, gestures, avatars).
How to study the reference without copying: create a play-money room at pokernow.com/start-game (nickname only, no account), join it from a second browser context, and measure with DevTools / puppeteer-core (`document.getAnimations()`, computed styles, bounding boxes at 1440×900 and an iPhone viewport). `docs/UI-REFINEMENT-PLAN.md` records the numbers already measured.

## 6. Invariants — do not break
1. **Server is authoritative.** The browser never shuffles, deals, awards pots or decides legality.
2. **No leaks.** A client's snapshot never contains another player's hidden cards or the deck/salts (asserted in `apps/server/test/server.test.ts`).
3. **Verifiable shuffle.** A SHA-256 Merkle root over the 52-card order is published before dealing; every revealed card carries a proof the browser verifies (`packages/engine/src/merkle.ts`, `apps/web/src/fairness.ts`).
4. **Chip conservation.** Stacks + pots + cashed-out chips always equal chips issued (property tests assert it after every command).
5. **Idempotent commands**, queued stack/rule changes applied at hand boundaries, deck encrypted at rest, pure engine (no clock/randomness inside).
6. Origin checks on WebSocket and cookie-authenticated writes; plain-text rendering of all user text; nickname rules in `packages/protocol`.

## 7. Verification expectations
After UI changes: `npm run typecheck && npm test && npm run build`, then run the e2e smoke test locally, then screenshot at 1920×1080, 1440×900, 1024×768, 768×1024, 412×915, 390×844, 390×664 and 360×640 (lobby, preflop, your turn, bet panel, flop, showdown, Options menu, Session Log) and actually look at them. Update `e2e/smoke.cjs` whenever selectors change. After deploying, run the smoke test against the live URL.
