# PokerThen - HANDOFF & NEXT STEPS (read this first)

> **UPDATE 2026-10-27 (read first):** Phases A (integration), B (desktop, phone and rules QA) and C (security and fairness review) are DONE, and the app is deployed on Azure App Service. `npm run typecheck`, `npm test` (761 tests) and `npm run test:e2e` (26 browser scenarios) pass. Since the plan below was written: host stack field on the create form (owner-approved difference), host re-sit takes the seat directly, phone approval-window buttons fixed, own-name colour and card-face geometry calibrated against the reference, opponents' cards show the small suit on phones. Still open: real-phone testing by the owner, the low-severity requests in `docs/requests/c-*.md`, and the unknowns in `docs/SPEC.md` section 22. The sections below are the original plan and are kept for context.


Written 2026-10-26 for: the owner AND any coding agent / new Claude session that continues the work. It is self-contained: read it, then `docs/ARCHITECTURE.md` and `docs/SPEC.md`, and you can carry on without the chat history.

---------------------------------------------------------------------
## 0. The one-paragraph picture
PokerThen is an EXACT clone of pokernow.com's private-friends Texas Hold'em tables (desktop + phone): same screens, wording, rules, timings, animations, hotkeys, settings, run-it-twice with live equity %, rabbit hunting, ledger, log, chat. Reasons for the site: the owner and friends distrust other sites' shuffles, so the **server shuffles with a crypto RNG and publishes a per-hand Merkle commitment; after each hand only the cards that were actually shown are revealed with proofs** (owner-approved design, `docs/FAIRNESS-MERKLE.md`). That is the ONLY addition. Everything visible must match PokerNow, EXCEPT the artwork, which is original (table felt colour, card back, logo, icons, sounds; owner said these may differ - everything else must be the same). Out of scope: community features, Plus features, accounts/captcha, other poker variants, voice/video, replayer.

## 1. Owner's standing rules (do not violate)
1. Do NOT assume behaviour. If something cannot be observed or found in `research/`, it stays a clearly marked placeholder (`// U-xx`) and goes on the UNKNOWN list; ask the owner or measure it live.
2. Do NOT change anything from the PokerNow behaviour/look except original artwork (+ the fairness proof).
3. Never copy PokerNow images/SVG/fonts/audio/source into the repo (`apps/web/test/art/art.test.ts` hashes our art against `research/evidence` to prove it).
4. Never deploy to Azure unless the owner explicitly asks. Never print/commit `SESSION_SECRET`.
5. The old repo code was discarded on purpose (owner confirmed). Do not read old GitHub contents. GitHub push access is already set up on this Mac; owner authorised replacing the repo contents.
6. The owner has limited Claude usage: run FEW agents at a time (max 3), give them narrow jobs, never keep re-messaging a finished agent (a finished agent re-sends its report each time it is woken - this wasted a lot in the last session).
7. The owner likes visual verification: take screenshots (1440x900, 1024x768, 768x1024, 390x844, 360x740) and actually look at them. Phone matters a lot; a real phone test is required before release.
8. Before the final message of any task: say what is done, what is not, and what was only tested in isolation. Report failures faithfully.

## 2. Where everything is (repo map, all under /Users/yashralhan/Projects/PokerThen)
```
docs/SPEC.md              source of truth for behaviour/copy/numbers (741 lines, 22 sections; section 22 = UNKNOWN list)
docs/ARCHITECTURE.md      build contract: tech, protocol, persistence, security, tests, workstreams W1-W8
docs/FAIRNESS-MERKLE.md   owner-approved per-card Merkle fairness (supersedes SPEC 20.2-20.4)
docs/CHANGES.md           log of contract changes   | docs/status/W1..W8.md per-workstream notes
docs/requests/*.md        open change requests / decisions between workstreams (see section 5)
research/01..08-*.md      the reverse-engineering reports (home/create, desktop UI, phone UI, settings/roles, protocol, rules, live gaps, closing unknowns)
research/evidence/        screenshots/captures (545 MB, GITIGNORED, local only; do not push; art test hashes against it)
research-scratch/         scratch screenshots (gitignored)
packages/shared  (W1)     types, constants, copy catalogue, delta/diff, Merkle fairness, validators, fixtures (31 Frame fixtures), testing helpers
packages/engine  (W2)     rules engine, RNG/shuffle, evaluator, equity, projection (what each viewer may see), log text, ledger
apps/server      (W3)     ws + HTTP server, tables, persistence (/home/data), cookies, origin checks, fairness endpoint
apps/web         (W4-W8)  React 18 + Vite client: src/core (W4), table (W5), actions+phone (W6), menus (W7), art+audio+pages (W8)
scripts/                  build.mjs, dev.mjs, deploy-zip.mjs (builds+zips, PRINTS the az command, does not run it), verify-hand.ts
tests/e2e/                puppeteer-core harness + scenarios (only E15 exists)
```
Commands: `npm run typecheck` | `npm test` | `npm run build` (-> dist/app/server.cjs + dist/app/public + package.json) | `npm run dev` | `npm run test:e2e` | `npm run pack:zip` | `npm run verify-hand`.
Chrome for tests: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (puppeteer-core is in node_modules). Note macOS has no `timeout` command.

## 3. Current status (verified 2026-10-26 after the last agent was stopped)
- `npm run typecheck` clean. `npm test`: **31 files / 756 tests pass** (engine: 20k random hands conserve chips & unique cards, hidden-card leak tests, RNG tests, evaluator vs brute force; server: crash recovery, persist-before-ack, leak test; web: geometry/strings/art/audio tests).
- `npm run build` worked for the server earlier (316 KB `server.cjs`, starts with no node_modules, `/healthz` OK); pack:zip produced a ~1 MB zip. Re-run to confirm after integration work.
- **Nothing has been committed or pushed. Nothing is deployed.** `git status` still shows the old repo files deleted (intentional) and everything new untracked.
- **NOT DONE: integration.** Each workstream was tested against mocks/fixtures. The real client has NEVER been run against the real server+engine in a browser. An integration agent was started and stopped by the owner almost immediately; assume it did nothing (docs/status/INTEGRATION.md does not exist). Expect real bugs.
- Research is complete except items in section 6. The live PokerNow test table (host Chrome profile in the old scratchpad) is no longer needed; do not use it again (it was left with changed settings and a different owner). Creating new PokerNow tables needs the owner to pass a Cloudflare captcha - avoid; all rules are already in `research/`.

## 4. PHASED PLAN (what to do next, in order)

### Phase A - Integration (ONE agent, may edit any file; log fixes in docs/CHANGES.md)
Goal: `npm run build`, run the real server, drive real browsers, play real hands, fix every bug. Known items to reconcile:
1. Two alert/confirm systems: `apps/web/src/menus/dialogs.tsx` (W7) vs `core/ui` showAlert/showConfirm (W4). Keep ONE (core/ui canonical, SPEC 4.9 look); W5/W6/W7 all use it.
2. W7 assumed hook signatures (`docs/requests/w7-hook-signatures.md`: `useHotkey(key, fn, {enabled?, skipGlobalLock?})`, `useModalLock()` as hook, Icon names `clock`/`chat`) - reconcile with real `core/hooks.ts`.
3. `GET /api/games/:id/log_v3` returns entries OLDEST-first; make the log modal handle it.
4. Wire W5 seat menu "Edit Player" (owner only) to `openEditPlayer(id)` exported by `menus/index.ts` (`docs/requests/w5-edit-player.md`).
5. Engine `ok` results carry an extra boolean `queued` (updateGame/updatePlayer/removePlayer) that is not in the frozen shared type: add it (`docs/requests/w2-engine-api.md`). Engine emits the two fairness log lines itself: the server must NOT synthesise them from commit/reveal effects; server keeps the LATEST superset `reveal` per hand.
6. Time bank: W6 `ActionArea` auto-sends `ATB` once per turn when nothing is queued; W4 must not also send it. Engine acts at limit + bank (+1.5 s grace) if the client never sends ATB.
7. W4 `TableScreen` must mount W7 `<ConfigScreen/>`, `<QuickAcceptHost/>`, `<ChatDock><LogButton/></ChatDock>` and W8 `TosBar`/`ConnectCard` with SPEC 4.1 z-order; W8 `NewGame` page must use the W4 router/ScaledCanvas (`NewGameScene` fallback).
8. Apply `docs/requests/w2-spec-updates.md` (live findings from research/08) into `docs/SPEC.md`; apply the safe subset of `docs/requests/w1-breaking-tighten-contracts.md` (six proposals; skip any that cause churn).
9. W4 assumptions to confirm against the real engine projection (`docs/requests/w2-w4-semantics.md`): displayed stack = `stack - currentBet - gained`, `pot.totalText` = full string "total N", between-hands state = `result !== null && nextStep === null`; a folded player's cards are `[]` for every viewer.
10. Real-engine leak test (the server's leak test only ran on the fake engine): scan every WS frame + every HTTP body against all 52 card codes through full hands incl. all-in, run-it-twice, rabbit hunt, folded/mucked cards.
11. Load check with the REAL engine (5 tables x 10 sockets; target < 150 MB RSS, low idle CPU).
Then: play real hands with 3-4 players (desktop contexts + one phone context iPhone UA/touch/DPR3): create table -> invite link -> sit request -> owner approve -> start -> fold-win, showdown, all-in + run-it-twice (use `DEV_FIXED_DECKS`, dev only), rabbit hunt, chat/bubbles, Options/settings (queued vs immediate), ledger/log, kill the socket (reconnect replay), restart server mid-hand (persistence), /verify PASS on a real hand and FAIL on a tampered one. Write e2e scenarios E1-E14 (ARCH 12.3; only E15 exists) and make `npm run test:e2e` pass. Keep notes in `docs/status/INTEGRATION.md` as you go.

### Phase B - Visual & behaviour QA (up to 3 agents in parallel AFTER Phase A; each only fixes in its area)
- **B1 Desktop visual QA**: compare running app vs `research/02`, `research/07` and `research/evidence/{desktop-ui,live-gaps}` stills at 1440x900, 1024x768; SPEC 4/7 numbers (geometry scripts exist: `apps/web/test/table/geometry.mjs`, animations.mjs); check every animation timing (flip stagger 150 ms, dealer slide 0.5 s, turn glow 0.4 s, winner glow, run-out 4.0 s per street, award 3.0 s/6.04 s windows, 8.07 s after all-in run-out, review-hand popover 3.1 s, chat bubble 7.2 s).
- **B2 Phone visual QA**: 390x844, 360x740, 430x932, 375x667, 768x1024 portrait, 844x390 landscape; `research/03`; scripts `apps/web/test/phone/measure.mjs`; screenshots of off-turn / your turn / raise panel / all-in / RIT / show-hand / rabbit / chat sheet / options / sit popover / ledger. The earlier W6 re-shoot after its last tweak was never done; the tablet (768x1024) shots from W8 were never viewed.
- **B3 Rules/e2e**: run the SPEC 11-15 scenarios end to end; compare log lines byte-for-byte (double spaces matter) with `research/06`, `07`, `08`; heads-up, straddle, dead button, missed blind, short all-in no-reopen, antes, rebuy (20 s prompt), time-bank refill, leave mid-hand, pause/stop, owner tools, spectator/god mode.

### Phase C - Security & fairness review (1 agent, read-mostly)
Origin checks (WS + unsafe HTTP), cookie flags (`Secure; HttpOnly; SameSite=Lax`), rate limits, body size limits, no deck/salt/unexposed card ever served, `state.json` mode 0600 (it holds the live deck/salt of the running hand), `SESSION_SECRET` required in production, zod validation, CSP header, `/verify` honest-limits text, tamper tests for `scripts/verify-hand.ts` (never tested with a tampered record), chain across hands, crash-recovery with SIGKILL mid-hand.

### Phase D - Owner review & git push (main session, with owner)
1. Show the owner screenshots (desktop + phone) and ask for: felt colour and card-back pattern preference (current placeholders: teal felt, plum+gold card back, amber accents; constants `U-A2`), and the other open decisions in section 6.
2. Real-phone test by the owner (address bar, keyboard, rotation, fullscreen, safe areas - emulators lie).
3. Push: `git remote` is `origin = https://github.com/yashhorseman/PokerThen.git`, branch `main`. Owner authorised wiping the old contents. Steps: `git add -A` (check `git status`: `research/evidence`, `research-scratch`, `node_modules`, `dist` must NOT be included - they are in `.gitignore`), write a README.md (what it is, fairness, how to run/build/deploy, link docs), commit with message ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, then `git push --force-with-lease origin main` (force is needed because history differs; confirm with the owner right before pushing). Run `npm run typecheck && npm test && npm run build` first.

### Phase E - Azure deployment (ONLY when the owner asks)
Existing resources (reuse; details from `/Users/yashralhan/Downloads/PokerThen-Azure-Hosting-Brief.md`): subscription "Azure subscription 1" (id in the owner's hosting brief); resource group `pokerthen-rg`; plan `ASP-pokerthenrg-b4b1` Linux Basic B1, ONE instance; web app `pokerthen-yash`, Node 22 LTS, Central India; URL `https://pokerthen-yash-hxeyf6g0g7bpbrh5.centralindia-01.azurewebsites.net`. Already set: WebSockets ON, Always On ON, HTTPS only, ARR affinity OFF, startup command `node server.cjs`, app setting `SESSION_SECRET` (random; never print), `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `WEBSITE_NODE_DEFAULT_VERSION=~22`, Application Insights attached. `az` is `/opt/homebrew/bin/az` (logged in as the owner; if "not logged in", ask the owner to run `az login`; never ask for a password; harmless Python SyntaxWarning noise is normal).
Steps:
1. Verify settings first: `az webapp show -g pokerthen-rg -n pokerthen-yash` and `az webapp config show ...` (web sockets, always on, https only, instance count = 1; do NOT scale out or use deployment slots with live traffic). Confirm `SESSION_SECRET` exists via `az webapp config appsettings list` WITHOUT printing its value. Server env: `PORT` is set by Azure; `DATA_DIR` defaults to `/home/data` when `WEBSITE_SITE_NAME` is set; `NODE_ENV=production` should be set (add as app setting if missing); optional `ALLOWED_ORIGINS`.
2. `npm run typecheck && npm test && npm run build && npm run pack:zip` (prints the deploy command; produces `dist/app.zip`).
3. **The app currently running at that URL is an OLD build with a different data format under `/home/data`**: before the first deploy of the new site, clear the old files (e.g. via `az webapp ssh` / Kudu: remove old contents of `/home/data`, keep nothing) - look at the directory first, then delete; tell the owner what you removed.
4. Deploy: `az webapp deploy -g pokerthen-rg -n pokerthen-yash --src-path dist/app.zip --type zip`.
5. Verify: `curl https://<url>/healthz`; open `/start-game`, create a table; WebSocket works through Azure (play 2-3 browsers incl. the owner's phone); logs `az webapp log tail -g pokerthen-rg -n pokerthen-yash`; restart the app once mid-hand and confirm the hand resumes (state is in `/home/data`).
6. Reminder to the owner: the free-trial credit expires about **2026-11-24**; after that the app stops or bills their card. Deleting `pokerthen-rg` removes everything. Deploy between games only (a restart interrupts live hands, though state is persisted).

## 5. Open requests/decisions files in `docs/requests/` (read before Phase A)
`w1-breaking-tighten-contracts.md` (6 proposals: make optional fields required; required EngineApi additions; required TableDataApi; replace `statusLabel` with `statusText`; drop `registered.you`; add `rabbit` kind to FairnessUsage) | `w2-engine-api.md` | `w2-spec-updates.md` | `w2-w4-semantics.md` | `w3-engine-api.md` | `w5-edit-player.md` | `w6-betpanel-vm.md` (resolved) | `w7-hook-signatures.md`.

## 6. UNKNOWNS and owner decisions (never guess; leave placeholder or ask)
Rules never observed on PokerNow (placeholders in `packages/engine/src/placeholders.ts`): **U-D5** who gets the odd chip in a TWO-way tied showdown (run-it-twice odd chip -> run 1 IS known; 3-way chop of 33 = 11 each IS known); **U-D8** hand-name text for full house / quads / straight flush (only the names seen in research are exact); **U-RIT1** `Always` run-it-twice log text/behaviour; **U-T6** offline-actor timeout; **U-D2** straddle edge cases (stack < 40); **U-G3** config value ranges/server validation; **U-LOG1/2** log wording for stop-cancel, queued-REMOVE and config-change field names not seen; ownership-transfer log line and remove-player-mid-hand line (transfer writes no log line in our engine); burn cards are not visible on PokerNow.
UI details never observed: **U-A2** felt/rail/card-back colours (OWN design - owner to choose); **U-V7** second dealer-disc offset (landscape); **U-L2** disconnect-banner wording between the two known fragments; **U-V4** blue hand-chip tone; **U-E1** emoji set; **U-G4** `?` popover texts and eye-button condition; **U-G6** when the blind structure locks; **U-R1** rebuy "Available values" hint; **U-G2** `invalid value` text for server field errors; **U-C3** chat-disabled tooltip; sit-popover vertical anchor for seats 9/10 on phone (guess in `portrait.css`); real-device keyboard behaviour. Also: "Spectator Mode = YES fails to save" was observed on PokerNow; engine requires table status `waiting`.
Owner decisions pending: felt colour + card-back pattern; table retention policy for old tables (**U-N2**, currently none); whether `Always` RIT skips the prompt silently; landing-page copy (**U-H1**); profanity rules (**U-C2**).
Decisions already taken (do not re-ask): per-card Merkle fairness; Raise button is green (live phone measurement beats the report's "yellow"); seated viewers are rotated to the bottom seat on phone/portrait, spectators see real seat numbers (desktop spectators measured unrotated); equity pills exist (server-computed, shown only after all-in reveal); run-out streets 4.0 s apart; Rebuy prompt 20 s; name PokerThen; Azure not Vercel; no voice/video.

## 7. Facts about the reference site that shaped the build (so nobody re-researches)
Everything lives in `research/*.md`; highlights: one scaled canvas (`html` font-size = 3.2% of canvas height; 16:9 landscape, 1:1.8 portrait); 10 fixed seat slots; no chip/card-flight animations (bets are number pills; state changes in one tick); timer is a thin bar under the plate (not a ring); dealer button white disc "D" slides 0.5 s; straddle marker "S"; the table receives deltas over socket.io (we use `ws` with the same snapshot+delta+`<D>` semantics); other players' hole cards are never sent until shown; equity % computed on the server; create-game requires a Cloudflare captcha (we do NOT replicate); invite link lands guests as spectators who click Sit -> "Request the Seat"; blinds 10/20 and stack 1000 defaults; names 2-14 chars unique; stack 1..1.000.000.

## 8. Agent playbook for the next sessions (keep usage low)
- Start every agent prompt with: "Read docs/HANDOFF-NEXT-STEPS.md, docs/ARCHITECTURE.md and the SPEC sections for your area. Follow section 1 rules. Never deploy/commit/push. Report <= 25 lines." Give each agent ONE narrow job and the exact files it may edit.
- Order: Phase A (1 agent) -> Phase B (B1, B2, B3 together = 3 agents) -> Phase C (1 agent) -> owner review/push (main) -> Phase E on request.
- Ask agents to write notes incrementally into `docs/status/*.md` so a rate-limit cutoff loses nothing; resume cut-off agents with SendMessage ONCE and do not re-message finished agents.
- Parallel agents must not edit the same files: split by folder (core/table/actions+phone/menus/art+pages/engine/server) or use git worktrees.
- If a live PokerNow check is ever needed: Chrome with `--remote-debugging-port` and a scratch profile; the owner must pass the captcha once and create the table; puppeteer `click()` hangs on the host tab (use `page.evaluate` DOM clicks); never open a second tab as the host (it auto-fires the time bank); never close the host Chrome mid-session (guests get disconnected and ownership can move).
- Memory notes for Claude sessions live in `/Users/yashralhan/.claude/projects/-Users-yashralhan-Projects-PokerThen-/memory/` (deployment, product direction, working style, clone scope). Update them when decisions change.

## 9. Definition of "finished"
1. `typecheck`, `test`, `build`, `test:e2e` green. 2. Real multi-browser games (desktop + phone) behave like PokerNow in every SPEC section, verified with screenshots and measured timings. 3. Leak test on the real engine green; `/verify` PASS on real hands, FAIL when tampered. 4. Owner approved colours and tested on a real phone. 5. Pushed to GitHub (README included). 6. If the owner asks: deployed to Azure and re-verified there. 7. Remaining unknowns listed honestly in README or SPEC 22.
