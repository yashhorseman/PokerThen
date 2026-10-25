# ♠ PokerThen

Private poker tables for friends, with a **server-side shuffle you can verify**. Create a table, send the invite link, the host approves seats, and you play No-Limit Texas Hold'em with fictional chips. No accounts, no downloads.

Live: https://pokerthen-yash-hxeyf6g0g7bpbrh5.centralindia-01.azurewebsites.net

## What works today

- **Tables:** one-click creation, unguessable invite link (`/t/<22-char id>`), host approval of every seat request and add-on, ownership transfer, remove player, end session.
- **Poker:** 2–10 players, blinds + ante, correct heads-up rules, raise-to betting with per-player re-raise rights (short all-ins don't reopen betting unless they add up to a full raise), side pots, uncalled-bet refunds, odd-chip rule, standard show/muck order, timeouts (check-if-free else fold, never call), time bank.
- **Host options:** blinds/ante, decision timer, time bank, auto-deal, showdown speed, reveal-when-all-in, **rabbit hunting**, **run it twice** (off / ask players / always), guest chat, pause (freezes the clock), stop-after-hand, deal-next-hand, queued rule and stack changes that apply at the next hand.
- **Players:** pre-actions (check/fold, call-this-amount), bet presets (min, ½, ¾, pot, all-in), sit out / back on big blind, add chips (host approves), show cards (left/right/both), chat, ledger (buy-in, buy-out, net, CSV), full log, two- or four-colour cards, chips or big blinds, sound, keyboard shortcuts (B, M, L, P).
- **Reconnect-safe:** refresh or lose connection and you keep your seat, your cards and your time; the server saves every table to disk and resumes after a restart.
- **Responsive:** desktop landscape table, and a tall table for phones and portrait tablets.

Not built yet (shown as "Not available yet" in the options, never as a dead toggle): Omaha variants, blind levels, straddle, bomb pots, double board, 7-2 bounty, Nit, cents, face-up spectators, hand replayer, avatars. Voice/video is intentionally out of scope. See [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md).

## Why you can trust the shuffle

1. The **server** deals — not any player's browser. It shuffles with Node's CSPRNG (`crypto.randomInt`, unbiased Fisher–Yates).
2. **Before any card is dealt** it publishes a Merkle-tree commitment to the 52-card order (each card has a secret salt).
3. Every card a player is shown (own hole cards, board, shown hands, burn cards after the hand, rabbit cards) comes with a **proof**. The browser checks the proof against the commitment, checks the card sits where the dealing procedure says it must, and checks it matches what's on screen. 🔒 in the top bar shows the log.
4. Folded/undealt cards are never revealed unless the rules say so, so privacy and verifiability coexist.

What this does **not** do: it can't stop whoever runs the server from reading the deck during play — that's true of any online poker site. The deck is encrypted at rest and never sent to clients, and the code is open. Details: [docs/PRIVACY-AND-FAIRNESS.md](docs/PRIVACY-AND-FAIRNESS.md).

## Develop

Requires Node 22+.

```bash
npm install
npm run dev:server        # API + WebSocket on :8787
npm run dev:web           # Vite on :5173 (proxies /api and /ws)
npm test                  # engine, property tests, server integration tests
npm run typecheck
npm run build && npm start     # production bundle on :8787
BASE=http://localhost:8787 npm run e2e   # 4-browser smoke test (needs Chrome; set CHROME_PATH if needed)
```

Layout: `packages/engine` (pure rules, no I/O), `packages/protocol` (wire schemas), `apps/server` (HTTP + WebSocket + persistence), `apps/web` (React). More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploy (Azure App Service, Linux, Node 22)

One-time: a Linux Web App with **Web sockets on**, **Always on**, **HTTPS only**, a **single instance**, and the startup command `node server.cjs`. Then:

```bash
az login
RG=pokerthen-rg APP=pokerthen-yash npm run deploy
```

App settings: `SESSION_SECRET` (≥24 random chars; signs session cookies and derives the key that encrypts decks at rest). Game data lives in `/home/data` (persistent on App Service). Optional: `ALLOWED_ORIGINS` (extra browser origins), `DATA_DIR`.

Keep the app at **one instance**: each table lives in one server process.

## House rules (also in the in-app help)

Moving button, no dead button · heads-up: dealer is small blind and acts first preflop, big blind first postflop · minimum raise = last full raise · odd chips go to the first winner left of the dealer · run-it-twice needs every player still in to agree (10 s; silence = once), splits the pot per board with the odd chip to run 1 · timeouts check or fold and put you to sit out.
