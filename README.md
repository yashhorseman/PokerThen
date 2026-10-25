# PokerThen

A private, play-money, browser-based Texas Hold'em site for friends: the host creates a table, shares the invite link,
approves players, and everyone plays in real time on desktop or phone. The table experience follows the private
"play with friends" tables of pokernow.com; all artwork is original.

**Why it exists:** the shuffle is done on the server (never in a browser) with a cryptographic RNG and is *verifiable*.
Before each hand the server publishes a SHA-256 commitment to the whole shuffled deck; after the hand (and the
rabbit-hunting window) it reveals the deck and salt. The Log modal has a **Verify** button that recomputes the hash in your
browser. Deck order and hashing rules: `src/engine/fairness.ts`.

## Run

```bash
npm install
npm run build          # -> dist/app  (server.cjs + public/)
PORT=3000 npm start    # data under ./data (set DATA_DIR to change)
npm run dev            # watch build + auto-restart
npm test               # engine unit tests
npm run typecheck
```

Open http://localhost:3000 → **Start a new game**, copy the table link, open it in other browsers/phones, request seats, approve, **Start Game**.

## Layout
```
src/shared   wire protocol + constants (the contract)         src/engine   all poker rules, pacing, log, ledger, fairness
src/server   http + websocket + persistence                   src/client   React SPA (table scene, shell/overlays, original art + audio)
docs/SPEC.md the build specification                          docs/DEPLOY.md  Azure App Service deployment
docs/OPEN-QUESTIONS.md  details that were not observable on the reference site and the choice made
```

## Deploy (Azure App Service, Node 22)
See `docs/DEPLOY.md`. Deploy only when the owner asks.
