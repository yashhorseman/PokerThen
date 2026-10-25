# Implementation status

Legend: ✅ implemented and tested · 🟡 implemented, lightly tested · ❌ not built.
"Spec" = `Private-Poker-Build-Specification.txt`. Voice/video was explicitly excluded by the product owner.

## Tests that exist (run `npm test`) — 40 passing

- Engine primitives: SHA-256 vs node:crypto, Merkle proofs (tamper rejection), side-pot fixtures (100/250/400 → 300+300 + refund 150; folded contributor; fold to unmatched raise), odd chips (34/33/33; 101 → 51/50), **evaluator vs an independent evaluator on 20,000 random matchups**.
- Engine hands: heads-up order, UTG order and button movement, raise-reopening fixtures (10→30 then short all-in 42; two short all-ins reaching a full raise), min-raise tracking, short blinds, refunds, three-way all-in with rigged deck, timers/time bank/pause/resume, run-it-twice (always/ask/decline/timeout), rabbit preview, leaving mid-hand.
- Property tests: ~1,900 random hands over 2–9 players (antes, run-twice modes) assert chip conservation after every command, unique cards across holes/burns/boards, no folded winners, and that every public proof verifies.
- Server integration (real WebSockets): create → approval → seat → hands; **no leak of other players' cards or the deck**; own-card proofs verify; idempotent commands; concurrent seat requests (exactly one seat, one buy-in); nickname rules; chat rate limit; Origin/cookie checks; **restart recovery with the same hand and cards, deck sealed at rest**; admin permissions.
- Browser smoke (`npm run e2e`, not in CI): 4 real browsers incl. reload-keeps-seat, chat, rabbit privacy, add-chips approval, leave seat, ledger reconciliation. Also run against the Azure deployment.

## Spec coverage

| Spec area | Status |
|---|---|
| A1–A2 create, invite, join, seat request, approve/reject/cancel, seat conflict | ✅ |
| A3 start / pause / stop-after-hand / next hand / end session / shuffle seats | ✅ (immediate pause freezes the clock; hard stop randomises dealer on restart; seats can be shuffled while stopped) |
| A4 player management: stack add/remove/set (reason, queued), remove, transfer ownership, leave, sit out, return on BB | ✅ · delegated managers ❌ |
| A5 playing a hand: legal actions, presets, pre-actions, showdown, show-left/right/both | ✅ |
| B visual system, 10-seat geometry, portrait layout, accessibility basics | 🟡 refined against a hands-on study of a reference table (docs/UI-REFINEMENT-PLAN.md): tokens, seat anchors, animations, hand badge, phone layout; verified in screenshots at 360–1920px; no automated visual/a11y suite |
| C settings: blinds, ante, rabbit, run twice, showdown speed, decision limit, time bank + refill, reveal, auto-start, guest chat | ✅ · chat-in-replay, trim excess, deal-to-away, cents ❌ (shown as unavailable) |
| C2–C3 blind levels, variants, rotation | ❌ |
| C5 personal preferences: deck colours, chips/BB, volume, chat beep, reduced motion, run-twice pref, auto time bank | ✅ · achievements/mood/gestures/themes ❌ |
| D2 rabbit hunting (per-viewer, never changes results) | ✅ |
| D3 run it twice (off/ask/always; unanimous; 10 s; odd chip to run 1) | ✅ (Hold'em only, as specified) |
| D1/D4–D8 deck-capacity matrix, bomb pots, double board, 7-2, Nit, simulated fee, face-up spectators | ❌ |
| E1 session log (live, chat, per-hand dividers) | ✅ · download of full log ❌ |
| E2 ledger with formula, expandable intervals, reconciliation, CSV (formula-injection safe) | ✅ |
| E3 replayer / saved hands | ❌ (hand events are in the log; structured replay not built) |
| E4 chat | ✅ · media ❌ (excluded) |
| E5 avatars / gestures | ❌ (generated initials avatars only) |
| F architecture: authoritative server, pure engine, idempotency, queued boundary changes, encrypted deck, recovery grace | ✅ |
| F: PostgreSQL, Redis, multiple workers + fencing epochs | ❌ — replaced by one process and atomic JSON files (see ARCHITECTURE.md). Must stay at one instance |
| F12 protocol: viewer-specific projections, command ids, resync | 🟡 full snapshot on every change instead of snapshot + deltas |
| F11 durable pause across restart, recovery grace | ✅ |
| G1 HTTP surface | 🟡 core routes only; admin actions go over the WebSocket through the same room actor |
| G5 phases 1–2 | ✅ · phase 3 partly · phases 4–5 ❌ |

## Known limitations

- One server instance only; a crash loses at most the command in flight (state is saved before each ack).
- Snapshot size grows with log + ledger (capped at 200 + 400 entries); fine for 10 players, wasteful at scale.
- Fairness proves the deck was fixed beforehand; it cannot stop the server operator from reading it.
- The Azure trial credit is time-limited; the app has no payment or account system.
