# PokerThen

Private, play-money Texas Hold'em tables for you and your friends, with a shuffle you can check.

PokerThen works like a PokerNow private table. One person creates a table, shares a link, approves who may sit down, and everyone plays in the browser on a computer or a phone. There are no accounts, nothing to download, no real money, and no voice or video. The one thing PokerThen adds is that the server's shuffle for every hand is locked in before the cards are dealt, so anyone can check it afterwards.

> **Status (2026-10-27):** a first full version, running on Azure and being tested by its owner and friends. At the last full check the type-check, the unit tests (761), the build and all 26 browser end-to-end scenarios passed, and real hands had been played in desktop and phone-sized browsers against the real server. Real-phone testing has only just started, and a few rules were never visible on the original site (see [Known limitations and unknowns](#known-limitations-and-unknowns)).

Contents: [How a game works](#how-a-game-works) | [Features](#features) | [Fairness in plain words](#fairness-in-plain-words) | [Running it yourself](#running-it-yourself) | [Deploying to Azure App Service](#deploying-to-azure-app-service) | [Known limitations and unknowns](#known-limitations-and-unknowns) | [Licence and credits](#licence-and-credits)

---

## How a game works

1. **Create a table.** Open the site, press *Start a new game*, type a nickname (2 to 14 characters) and press *Create Game*. You are the owner (the host). The form also asks for your starting stack (*Your Stack*, 1,000 by default; this is one deliberate difference from PokerNow, which always gives the host 1,000). You are already seated with it and the blinds are 10/20. The owner can change the blinds in *Options > Game Configurations* and any player's chips in *Options > Players*. If the owner leaves the seat and sits down again, the owner takes the seat directly (*Take the Seat*), with no approval step.
2. **Share the link.** The address in your browser is the invite link. The *Copy Link* button on the "Waiting for others" banner copies it. Anyone who has the link can open the table and watch, so treat the link like a key.
3. **Friends ask for a seat.** They open the link, land on the table as spectators, click an empty seat marked *Sit*, type a name and the number of chips they want, and press *Request the Seat*. They can cancel the request while they wait.
4. **The owner approves.** A box appears for the owner: *The player "Name" wants to join the game!* with *Accept*, *Reject* and *Ignore*. The owner can change the stack before accepting. Ignored requests wait in *Options > Players*.
5. **Start.** With two or more seated players the owner presses *Start Game* (or *Shuffle Seats* first, to randomise the seating). After that every hand is dealt automatically, unless the owner has turned off *Auto start the next hand*. Then the owner presses *Next Hand*.
6. **Play.** On your turn use the buttons at the bottom: Fold, Check, Call, Bet or Raise. The raise panel has Min Raise, 1/2 Pot, 3/4 Pot, Pot and All In shortcuts and a slider. Before your turn you can pre-select Check, Call or Check/Fold. The default is 20 seconds per decision plus a 10-second time bank. On a computer the keys are `k` check, `c` call, `r` raise, `f` fold, `i` check/fold, `t` extra time, `m` chat, `l` log, `b` show chips as big blinds, `s` show cards, and for the owner `p` pause and Enter for Next Hand.
7. **After a hand.** The Log shows every action, the Ledger shows who bought in for how much and who is up or down. A few seconds after each hand you can [check that the shuffle was honest](docs/HOW-TO-VERIFY-FAIRNESS.md).
8. **Owner tools.** *Options > Game Configurations* (blinds, antes, run it twice, straddle, time limits and more; changes made during a hand apply from the next hand), *Options > Players* (approve or deny, add, remove or set a player's chips, put a player away, remove a player, hand over ownership), and the Pause and Stop buttons.
9. **Coming back.** There are no accounts. Your browser's cookie is who you are, so you keep your seat, and the owner keeps ownership, only in the same browser. Closing the tab is fine: open the link again. Clearing cookies, or using a private window, makes you a stranger. Private windows are handy for testing alone, because each one is a separate player.

If something goes wrong:

- *The link sends me to the home page.* That table does not exist (typo in the link, or the server's saved data was reset).
- *"Connection failed!"* Cookies are blocked. The site needs one cookie to know who you are.
- *I don't see Start Game.* Only the owner sees it, and only while two or more players are seated and the game has not started.
- *My phone locked, or I closed the tab.* Open the link again in the same browser and you are back in your seat. While you are gone your turns run out of time like anyone else's, and the game folds or checks for you.

## Features

The behaviour, wording and numbers follow PokerNow's private tables (details in [docs/SPEC.md](docs/SPEC.md)). The artwork is original.

**Tables and seats**
- Up to 10 seats, no-limit Texas Hold'em, play money only.
- Invite by link. Guests watch first, then request a seat. The owner approves or rejects every seat, and can edit the stack when approving.
- Sit with *Away* set, Leave Seat, Away and I'm Back. Waiting players join at the next hand.
- Owner tools: add, remove or set a player's chips; remove a player; put a player away; transfer ownership; pause; stop at the end of the hand; shuffle seats.
- Rebuy for busted players (when allowed): the player asks, the owner approves, with a 20-second window.
- Spectator mode: the owner can allow chosen unseated viewers to see seated players' hole cards (only for players who allow it).

**The game**
- Blinds (default 10/20) with optional blind levels and a countdown to the next level, optional antes, optional decimal values ("cents").
- Optional UTG straddle (2 big blinds). The owner allows it for the table and each player chooses in Preferences whether to straddle automatically.
- **Run it twice** (*Always*, *Ask Players* or *No*): when everyone is all-in, the board is dealt twice and the pot is split. **Live win percentages** are shown next to the all-in hands while the board runs out.
- **Rabbit hunting** (optional): after a hand ends early, any seated player can reveal the cards that would have come.
- Show your cards after a hand (both, or just one). A setting (on by default) turns all hands face up when betting ends with everyone all-in.
- Decision time limit, time bank that refills over several hands, automatic fold or check when time runs out.
- Pre-selected actions (Check, Call, Check/Fold) that fire when your turn comes. A confirmation when you try to fold with a free check.
- Side pots, uncalled bets returned, dead button and missed blinds, short all-in that does not reopen the betting, showdown speed (Fast, Normal, Slow).
- Auto-deal on or off, deal to away players on or off, trim excess bets on or off, guest chat on or off.

**Information and chat**
- **Log**: every hand with names, cards and amounts, with paging between hands and a CSV download. **Ledger**: buy-in, buy-out, stack and net for every player, with per-session details and a CSV download.
- **Chat** with speech bubbles above players, a mute list per player, and mood emoji.
- Custom settings presets (up to 5, saved on your device, desktop layout).

**Screen and phone**
- One layout that scales to any window on desktop, and a separate upright layout for phones.
- Sounds (original, made in the browser) with a volume button, two-colour or four-colour card faces, chip values in big blinds, fullscreen button.
- Preferences are saved per device.

**Fairness**
- Every hand's shuffle is committed in advance and can be verified afterwards on the `/verify` page or with a command-line tool. See the next section.

## Fairness in plain words

It is hard to trust a shuffle you cannot see. PokerThen shuffles on the server, so it gives you a way to check.

- **Before the cards.** For every hand the server shuffles a fresh 52-card deck using the computer's secure random-number generator (a standard Fisher-Yates shuffle, written to avoid bias). Before anyone sees a card, the hand log shows a line `Hand commitment (SHA-256): ...` followed by a 64-character code. That code is a fingerprint of the exact deck order. Think of it as sealing the deck in an envelope and showing everyone the seal.
- **After the hand.** A few seconds after the hand ends, when the next hand is about to be dealt, the server publishes proof for the cards that were actually shown: the board and any hole cards that were turned up. Each one comes with a short proof that this card was in the sealed deck at that position. Folded or mucked hole cards, burn cards and cards that were never dealt are not published.
- **Chained.** Each hand's seal includes the previous hand's seal, so an old hand cannot be quietly rewritten later.
- **Checking.** The log line `Hand reveal: ... Verify` links to the `/verify` page, which does the check in your browser. Developers can run `npm run verify-hand`. Step by step: [docs/HOW-TO-VERIFY-FAIRNESS.md](docs/HOW-TO-VERIFY-FAIRNESS.md).

What it does not do: it shows that the deck was fixed before play and that every shown card came from it. By itself it cannot prove that the shuffle was random. That rests on the open-source shuffle code and its tests, and on the site really running that code. The how-to lists every limit.

## Running it yourself

For developers, and for anyone who wants to run a private copy. You need Node.js 22 or newer. Development and testing were done on macOS. Linux should work. Windows has not been tried (the dev script and the zip step assume a Unix shell).

```bash
git clone https://github.com/yashhorseman/PokerThen.git
cd PokerThen
npm install
npm run dev        # then open http://localhost:5173
```

To run the production bundle locally instead (leave `NODE_ENV` unset for a local run; production mode expects HTTPS):

```bash
npm run build
npm start          # http://localhost:3000
```

Open the table link in two different browsers, or one normal and one private window, to play against yourself. Local tables are saved in the `.data/` folder. Do not commit it: it holds the live deck of any hand in progress.

### Commands

| Command | What it does |
|---|---|
| `npm install` | Installs everything (all workspaces). |
| `npm run dev` | Server on port 3000 plus the Vite web server on port 5173 with live reload. Open http://localhost:5173. |
| `npm test` | Unit and integration tests (Vitest). `npm run test:watch` re-runs them on change. |
| `npm run typecheck` | TypeScript check of every package (`tsc -b`). |
| `npm run build` | Production build into `dist/app/`: `server.cjs` (one bundled file), `public/` (the website) and a small `package.json`. |
| `npm start` | Runs the built app, `node dist/app/server.cjs`. Run `npm run build` first. |
| `npm run test:e2e` | Browser scenarios: starts a real server, opens several Chrome windows (desktop and phone-sized) and plays real hands. Run `npm run build` first. Needs Google Chrome (set `CHROME_PATH` if it is not at the macOS default location). Add a name filter such as `-- E05`, or `-- --headed` to watch the windows. |
| `npm run pack:zip` | Builds and zips `dist/app` into `dist/app.zip` for Azure zip deploy. It prints the deploy command and never deploys. `-- --no-build` skips the build. Needs the `zip` command. |
| `npm run verify-hand -- <file or URL>` | Checks one hand's fairness record. See [docs/HOW-TO-VERIFY-FAIRNESS.md](docs/HOW-TO-VERIFY-FAIRNESS.md). |

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on (all network interfaces). Azure sets it for you. |
| `DATA_DIR` | `./.data`, or `/home/data` when running on Azure App Service | Where tables are saved: one folder per table with its state, log, fairness records and chat. Keep it between restarts. |
| `SESSION_SECRET` | an insecure built-in value, for local use only | **Required** when `NODE_ENV=production` (the server refuses to start without it). It is used to turn each browser's cookie into a player id. Use a long random value, keep it private, never put it in the repository, and do not change it while tables exist, or every browser becomes a stranger to its own seats. |
| `ALLOWED_ORIGINS` | empty | Comma-separated extra website addresses (for example `https://poker.example.com`) that may open live connections and send changes, in addition to the site's own address. Rarely needed. |
| `NODE_ENV` | unset | `production` turns on production behaviour: `SESSION_SECRET` is required, cookies are marked `Secure` (so the site must be served over HTTPS), and development-only settings are ignored. Leave it unset for local runs. |
| `DEV_FIXED_DECKS` | unset | **Development and tests only.** Path to a JSON file of scripted decks so tests get predictable hands. Ignored when `NODE_ENV=production`. Never use it for real games, because it defeats the fairness. |

Also read by the server: `TRUST_PROXY=1` (trust `X-Forwarded-*` headers; automatic on Azure), `PUBLIC_DIR` (serve the website from another folder) and `DEV_ORIGINS` (set by `npm run dev`; ignored in production). See [apps/server/README.md](apps/server/README.md).

### Repo layout

```
apps/
  server/          Node server: serves the site, HTTP API, live play over WebSocket,
                   saves tables to disk, serves the fairness records
    src/           http/ ws/ tables/ persistence/ fairness/ logs/ chat/
    test/          server tests (crash recovery, hidden-card leak test, ...)
  web/             the website (React 18 + Vite)
    src/core/      connection, state, layout scaling, shared UI pieces
    src/table/     the table: seats, cards, pot, dealer button, timers
    src/actions/   action buttons, raise panel, run-it-twice prompt, time bank
    src/phone/     the upright phone layout
    src/menus/     options, game settings, players, log and ledger, chat, dialogs
    src/art/       original artwork        src/audio/  original sounds (synthesised)
    src/pages/     home, new game, how to play, and the /verify page
packages/
  shared/          types, wire protocol, constants and text, and the fairness maths
                   used by both the server and the browser
  engine/          the rules: shuffle, dealing, betting, pots, hand ranking, equity,
                   and what each player is allowed to see
scripts/           build.mjs, dev.mjs, deploy-zip.mjs, verify-hand.ts
tests/e2e/         browser scenarios against a real server
docs/              the documents listed below
research/          notes from studying PokerNow's private tables (screenshots stay local)
dist/              build output (not in git)
```

### Documentation

- [docs/HOW-TO-VERIFY-FAIRNESS.md](docs/HOW-TO-VERIFY-FAIRNESS.md): how to check a hand, and what the check proves and does not prove.
- [docs/FAIRNESS-MERKLE.md](docs/FAIRNESS-MERKLE.md): the exact construction of the commitment and proofs.
- [docs/SPEC.md](docs/SPEC.md): behaviour, wording and numbers. Section 22 lists everything unknown, section 23 the findings from live testing.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): technology, wire protocol, saved-data format, security, tests.
- [apps/server/README.md](apps/server/README.md): server settings and Azure notes.
- [docs/HANDOFF-NEXT-STEPS.md](docs/HANDOFF-NEXT-STEPS.md): where the work stands and what to do next, for whoever continues. [docs/CHANGES.md](docs/CHANGES.md) logs contract changes; `docs/status/` and `docs/requests/` hold working notes.

## Deploying to Azure App Service

PokerThen is a single Node.js process, built to run on Azure App Service for Linux with Node 22. The settings that matter:

- **One instance only.** Do not scale out and do not use deployment slots with live traffic. Tables live in one process and in files on disk.
- **WebSockets on.** Live play uses them. Also turn on Always On and HTTPS only.
- **Persistence under `/home/data`.** App Service keeps `/home` across restarts and deployments and wipes everything else. The server chooses `/home/data` by itself when it runs on App Service.
- **App settings:** `SESSION_SECRET` (required, set in the Azure portal or CLI, never in the repository), `NODE_ENV=production`, `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (the zip is already built, nothing is installed on Azure) and optionally `ALLOWED_ORIGINS`. `PORT` is set by Azure.
- **Startup command:** `node server.cjs`.
- **Zip deploy.** `npm run pack:zip` produces `dist/app.zip` and does not deploy anything. Upload it with Azure's zip deploy only when the owner says so:
  `az webapp deploy --resource-group <resource-group> --name <app-name> --src-path dist/app.zip --type zip`
- **Deploy between games.** A restart interrupts live hands. Saved state lets a hand resume afterwards, but players have to reconnect.
- **After a deploy,** open `/healthz` (it should answer with `"ok":true`), create a table and play a hand with two browsers.

The first hosting runs on a time-limited Azure trial credit (it ends around the end of November 2026), so the site may go offline then unless the owner arranges other hosting. More detail: [apps/server/README.md](apps/server/README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (sections 1, 7, 8 and 9).

## Known limitations and unknowns

PokerThen follows PokerNow, but only what could be observed. Where something was never seen, the code uses a clearly named placeholder instead of a guess presented as fact. The full list is section 22 of [docs/SPEC.md](docs/SPEC.md). In short:

**Testing**
- Done: type-check, several hundred unit tests (the rules engine on 20,000 random hands that conserve chips and never repeat a card, hidden-card leak tests, shuffle tests, server crash recovery), and browser scenarios with several real Chrome windows including phone-sized ones (create, join, approve, all-in with run it twice and win percentages, rabbit hunting, straddle, antes, short all-in, reconnect, a server restart in the middle of a hand, and the `/verify` page passing a real hand and failing a tampered one).
- Also covered in browser scenarios: rebuy, spectator mode, a full 10-player table and blind-level progression.
- Not done: a systematic test on real phones (address bar, keyboard, rotation and notches behave differently from emulators), Windows, and browsers other than Chrome. `docs/status/` and `docs/requests/` have the current notes.

**Rules the original site never showed** (placeholders in `packages/engine/src/placeholders.ts`)
- Who gets the odd chip when two players tie and the pot does not divide evenly (placeholder: the first winner left of the dealer). The odd chip in run it twice (it goes to the first run) and a three-way chop are known.
- The exact log wording for some hand names (full house, four of a kind, straight flush, royal flush) and for a few rare events (a cancelled stop, ownership transfer, several setting names).
- What *Always* run it twice does and logs, how long an offline player gets before timing out, and straddle edge cases (a straddler with fewer than 40 chips, several straddles).
- Allowed ranges for blinds, antes, durations and time settings, and the wording of the server's field errors.
- Who must show first at a complicated showdown, and what is shown when *Reveal all hands when no more action is possible* is off.
- Burn cards are invisible on the original, so PokerThen uses its own documented deal order.
- The original's method and rounding for the win percentages; PokerThen computes exact odds where that is cheap and otherwise a large random simulation, and shows whole numbers.
- Spectator ("god") mode was never seen working on the original. Here it can only be switched on while the table is waiting (before Start Game, or after Stop).

**Look and feel details never seen:** the text of some `?` help popovers; the list of mood emoji (a placeholder set of eight); the full wording of the disconnect banner; the tooltip when chat is switched off.

**Waiting for the owner:** how long old tables are kept (today: forever, nothing is cleaned up), whether *Always* run it twice should skip the prompt silently, the wording of the home page, profanity rules (the filter is off), and real rate limits (the current ones are placeholders: for example 20 open connections per IP address, which friends sharing one home network share).

**Running it:** one instance only; a restart or deploy interrupts live hands; there are no backups of `DATA_DIR`; anyone with a table link can watch; the tutorial page is a short static rules page, not an interactive tutorial; phones are meant to be held upright (a sideways phone shows a small copy of the desktop layout).

**Left out on purpose:** accounts and captchas, voice and video, avatars and badges, the hand replayer, tournaments and clubs, waitlists, scheduled games, other poker variants, PokerNow Plus features and emoji gestures.

## Licence and credits

- PokerThen is an independent project. It is **not affiliated with, endorsed by or connected to PokerNow** (Poker Now) or its owners. The name is used only to say what PokerThen imitates: how private tables work. Because the goal is that people who know PokerNow feel at home, most of the on-screen wording and the behaviour follow PokerNow's. Other names belong to their owners.
- **All artwork is original to this project** (teal felt, plum and gold card back and the rest were approved by the owner): logo, icons, card back, suits, felt and room backgrounds, dealer button, and every sound (made in the browser). No images, fonts, audio or code from PokerNow are included. A test compares the art files against the reference captures the owner keeps locally and fails if any file is identical (it is skipped when those captures are not present).
- Fonts are Mulish and Abril Fatface from [Fontsource](https://fontsource.org), under the SIL Open Font License 1.1, served from the site itself.
- The project uses open-source libraries such as React, Vite, esbuild, ws, zod, TypeScript, Vitest and puppeteer-core, each under its own licence.
- **No licence has been chosen for PokerThen's own code and art yet.** There is no `LICENSE` file and the packages are marked private, so please ask the owner before reusing them.
