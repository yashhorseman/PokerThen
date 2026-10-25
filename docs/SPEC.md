# PokerThen — build spec (master document)

PokerThen is a private, play-money, browser Texas Hold'em site that must look, feel and behave **exactly like the
private "play with friends" tables of the reference site (pokernow.com)** — on desktop AND phone — with these
differences only:

1. **Original artwork** — logo, card back, felt/table art, icons, sounds, favicon are our own (never copy the reference
   site's images, SVGs, fonts or audio; never paste their source code).  The *look* (sizes, proportions, layout,
   colours of UI chrome, typography) matches; the *art assets* are redrawn.  The default felt is green; the table colour
   and card-back pattern are free to differ.
2. **Verifiable fair shuffle** — the server shuffles with a CSPRNG and commits to the deck (SHA-256) before dealing;
   deck + salt are revealed after the hand (see `FairnessRecord` in `src/shared/protocol.ts`).  This is the only
   addition; it appears only as log lines (and a fairness lookup in the Log modal).
3. **Out of scope (not built, not shown)**: community features (lounge, clubs, tournaments, leaderboards, accounts, sign-in),
   non-Hold'em variants, voice/video, "Plus"-gated features (bomb pot, double board, 7-2 bounty, nit game, simulated fee,
   theme designer, hand saving), gestures/NC coins, promotional content, captcha (Turnstile), schedule-next-game.
   Where the reference shows a button for these in a place that matters for layout, leave the layout slot out silently.

**Golden rules**
- *Never assume.* The reports in `research/` (gitignored, read them!) are the spec.  If a detail is not in them, look at
  the evidence screenshots (`research/evidence/**`, JPGs — open them with the Read tool), and if it is still unknown choose
  the most conventional poker/UX behaviour **and append a line to `docs/OPEN-QUESTIONS.md`** (`Q: … | chosen: … | where: file`).
  The owner reviews that list at the end.
- Strings are verbatim from the reports (including their typos where a report says "verbatim").  UI text that the CSS
  uppercases stays sentence-case in the DOM.
- Everything the owner cannot see must stay server-side: other players' hole cards are NEVER sent to a client that is
  not entitled to them.

## Reference material (read before coding your part)
| file | content |
|---|---|
| `research/BRIEF.md` | how the study was done |
| `research/01-home-and-create.md` | home page, New Game form, invite/join, seat request/approval flow, validation texts, cookies |
| `research/02-desktop-table-ui.md` | desktop table: scaling model, every position/size in rem, plates, cards, bets, pot, action bar, bet panel, menus, chat, log, sounds, timer, banners, animation inventory, live measurements |
| `research/03-phone-ui.md` | portrait layout (own seat anchors, scales, chat sheet, log modal, options), orientation rules, in-hand phone measurements |
| `research/04-settings-and-roles.md` | roles, Options menu, all 25 settings with labels/defaults, Players screen, edit player, host controls, preferences (17), hotkeys, log/ledger/replayer, log line grammar |
| `research/05-protocol-and-client-logic.md` | reference protocol, state semantics, hidden-card rules, intended-action logic, timer maths, sequence diagrams |
| `research/06-rules-engine.md` | observed rules + 17-rule RULES SPEC + verbatim log lines |
| `research/evidence/<topic>/*.jpg` | screenshots (desktop-ui, phone-ui, home, settings, rules, live-gaps; `rules/22-rit-*`, `24-rit-*`, `26-rit-*` = run-it-twice sequences with equity pills; `rules/20-showdown.jpg` log modal; `phone-ui/phone-showdown-winner.jpg`; `desktop-ui/anim-*-montage.jpg`) |
| `research/evidence/desktop-ui/frames/` | ~115 frame-by-frame shots + `events*.json` (DOM mutation timings) |

NOTE the reference host table used a *seasonal purple Halloween felt*; ignore the purple/pumpkins — ours is a green felt
with a dark rail (original art).

## Architecture
```
src/shared/     protocol.ts (THE contract), constants.ts (pacing), cards.ts
src/engine/     pure game domain: rules, lifecycle, pacing, log, ledger, chat, fairness   -> implements src/engine/types.ts
src/server/     http + ws + cookies + persistence + frame fan-out (main session)
src/client/     React 18 SPA (esbuild)    main.tsx router · shell/ pages+overlays · table/ scene · art/ icons+audio · state/ stores · net/ ws
test/           node:test unit tests (engine)      e2e/  Playwright scripts
scripts/build.mjs  -> dist/app/{server.cjs,public/,package.json}  (Azure App Service, Node 22, `node server.cjs`, PORT env)
```
- Server authoritative; protocol = full per-recipient `Frame` on every change (+ `registered` on connect), `ClientAction`s
  and `rpc` calls.  See comments in `src/shared/protocol.ts`.
- Persistence: JSON per table in `DATA_DIR` (default `/home/data` on Azure, `./data` locally), written atomically after every mutating call.
- Identity: random `ptt` cookie (httpOnly, Secure when https, SameSite=Lax, 1 year) -> 10-char player id.  No login.
- Table id: `pgl` + 21 url-safe chars.  Unknown id -> 302 `/`.
- Client scaling: ONE `#canvas` (16:9 landscape / 1:1.8 portrait), `html{font-size:0.032*canvasHeight}`, everything in rem/% — see
  `src/client/table/Canvas.tsx` (already written).  Orientation: mobile UA -> `screen.orientation`, else `matchMedia`.
- Client state: `state/store.ts` (frame/chat/connection), `state/prefs.ts` (localStorage `currentPlayer`), `state/ui.ts`
  (overlay state + `showAlert/showConfirm/showToast`), `net/connection.ts` (`sendAction`, `rpc`, `startConnection`).

## Commands
`npm run build` · `npm run typecheck` · `npm test` · `npm run dev` (watch, PORT 3000) · `npm run e2e`

## Pacing (engine owns it; measured from real server frames — `src/shared/constants.ts`)
```
action applied ──800ms──▶ next actor (20s clock; +time bank) | next street | all-in handling | result
fold-out ──800ms──▶ result (gT 5) ──3.0s──▶ next hand (rabbit window = this 3s, +3s per Reveal press)
showdown after river betting ──800ms──▶ cards shown + result ──showdownTime(3/6/9s)──▶ next hand
all-in (no further betting possible, board incomplete):
   [ritVote 10s if runItTwice='ask_players' and ≥2 live players; unanimous Yes -> 2 runs; any No / timeout -> 1 run]
   ─ afterVote 800ms ─ allInReveal 4s (hole cards face-up for all live players if config.revealAll, equity % shown)
   ─ flop ─4s─ turn ─4s─ river ─(runs=2: ─4s─ run-2 streets 4s apart)─ 4s ─▶ result ──(showdownTime +2s if 2 runs)──▶ next hand
turn clock: decisionTimeSec then the time bank auto-activates (pref) then auto fold (if facing a bet) / check; log shows plain "folds"/"checks"
```
Run-it-twice after the flop/turn: only the missing streets are dealt twice (board row 2 starts as a copy of the shared cards).
Each pot (main + side pots) is split in half per run (odd chip: ASSUMPTION — to the first player left of the button, log it in OPEN-QUESTIONS).

## Engine behaviour checklist (all from research/06 RULES SPEC + 04 + 05)
Seats 1–10 · owner Start Game (≥2 players) / Shuffle Seats · button moves to next occupied seat, "(dead button)" when the seat is empty · heads-up (dealer = SB; BB acts first postflop) ·
blinds/antes, blind levels clock ("Next Blind: …") · UTG 2BB straddle (table setting + player pref `SSP`) · min-raise / short all-in no-reopen
(`cannotRaiseIds`) · uncalled bet return · side pots · showdown order & auto-muck · hand names ("Pair, K's", "Two Pair, 5's & 2's", "Straight, 9 High" …) and short labels (`two pair (A,7)`) ·
all-in equity (`equity`, exact when ≤2 cards to come, otherwise Monte-Carlo ≥20k samples; client rounds) · run it twice (Always/Ask Players/No; player pref auto-answer is client side) ·
rabbit hunting (Reveal per viewer) · show cards after hand (`SHOW_HAND`, `canShow`) · timers/time bank (+refill every N hands) · away / leave seat mid-hand (check/fold mode) / busted auto-quit ·
missed blinds ("posts a missing small blind of 10", "Dead Small Blind") · joiners "IN NEXT HAND" · pause / stop-on-next-hand (random dealer on restart, forgive missed blinds) · rebuy (allowRebuy) ·
owner tools: approve (edit stack)/reject, edit stack add/remove/set, remove, away, transfer ownership, spectator/god mode · config changes queued during a hand ("Game Config Changes" log block) ·
log (verbatim grammar), ledger (buy-in/out/net, sessions, CSV), chat (100 chars, guest chat setting, mute, recording flag) · fairness commit/reveal.

## Visual verification protocol (client agents)
Build, run `PORT=3000 DATA_DIR=./data node dist/app/server.cjs` (or the dev mock route `/__dev?scenario=…` your agent defines),
drive with Playwright (`const {chromium}=require('playwright')` works globally; **do not** `npx playwright install`) and
screenshot at **1440×900, 1024×768, 768×1024, 390×844, 360×740**.  Open the screenshots AND the matching reference screenshots with the Read tool
and compare side by side; fix differences in layout/spacing/typography/colours before reporting.  Measure with
`getBoundingClientRect` against the numbers in the reports (rem math: px = rem × html font-size).

## Working agreement for agents
- You own ONLY the paths listed in your task.  Do not edit other agents' files; if you need a change elsewhere, add a note to
  `docs/INTEGRATION-NOTES.md` (append) and work around it.  `src/shared/protocol.ts` changes are additive only + a line in `docs/PROTOCOL-CHANGES.md`.
- Do not run `git commit/push/checkout/stash/reset` — the main session commits.  Do not install new npm packages without a note in INTEGRATION-NOTES (react/react-dom/ws/esbuild/tsx/typescript are available).
- TypeScript strict; `npm run typecheck` must pass for your files; keep code idiomatic and commented where behaviour comes from a report ("research/03 §5.2").
- Finish with a report (≤30 lines): what is done, what is NOT done, deviations, new OPEN-QUESTIONS.
