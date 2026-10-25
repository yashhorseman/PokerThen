# Architecture

```
packages/engine    pure poker rules + RNG-free state machine, SHA-256, Merkle commitment, evaluator
packages/protocol  zod command schemas, snapshot types shared by server and browser
apps/server        node http + ws, room actor, JSON persistence, static hosting
apps/web           React + Vite client
```

## Engine (`packages/engine`)

`apply(state, command, now) → { state, events }` — clones the state, applies one command, or throws an `EngineError` with a typed code. It never reads the clock or generates randomness: the shuffled deck and salts arrive in `START_HAND`, and time arrives as `now`. That makes every hand replayable and lets the property tests drive it deterministically.

Hand phases: `BETTING → RUNOUT_VOTE → RUNOUT → COMPLETE`. Streets are derived from the board length.

Betting rules in one place (`doAction`, `legalActions`):
- A player may raise if they have not acted this street, **or** the wager they last matched is at least one full raise below the current bet (`currentBet − actedLevel ≥ minRaise`). This tracks reopening per player; a single short all-in never reopens, cumulative ones do once they reach a full raise.
- Opening bets below the big blind (short all-ins) can be completed to the big blind.
- Short forced bets simply leave a player all-in; the amount to call is still the full big blind.

Settlement (`pots.ts`, `showdown`): uncalled excess is refunded; pots are built from sorted contribution levels; folded players fund pots but are never eligible; ties split with odd chips to the first winner left of the dealer; run-it-twice splits each pot between boards (odd chip to run 1). Show order: last aggressor first (else left of dealer); a hand is shown only if it can beat or tie the best so far; winners always show.

Dealing procedure (this is what the verifier checks): with `n` players, listed starting left of the dealer, player `k` holds `deck[k]` and `deck[n+k]`. Then burn at `2n`, flop `2n+1..3`, burn `2n+4`, turn `2n+5`, burn `2n+6`, river `2n+7`. Run 2 continues from the cursor with its own burns.

Scheduling: `nextDue(state)` says which command (`TIMEOUT`, `VOTE_TIMEOUT`, `STEP`, `START_HAND`) is due and when. `PAUSE`/`RESUME` shift every absolute timestamp so the remaining time is preserved. After a crash the server applies a 10 s recovery grace so nothing becomes overdue while it was down.

## Server (`apps/server`)

- **Room actor (`room.ts`)** — one `Room` per table, executed synchronously (single-threaded Node ⇒ commands are serialised). Owns admission, requests, ledger, queued stack/rule changes, chat, the log, and builds each viewer's snapshot. A command is validated, applied (engine first, so nothing is half-applied), persisted, then acknowledged.
- **Idempotency** — every command carries a `commandId`; results are stored per member (last 100). Same id + same payload replays the result; same id + different payload is refused.
- **Queued changes** — while a member is in a hand, stack edits, add-ons and rule changes are queued and applied at the hand boundary in this order: settle → queued stack changes → queued rule change → schedule next hand.
- **Persistence (`store.ts`)** — one JSON file per room in `DATA_DIR`, written to a temp file and renamed. The hand's deck and salts are sealed with AES-256-GCM (key derived from `SESSION_SECRET`) and removed from the plaintext JSON.
- **Transport (`server.ts`)** — `POST /api/v1/guest-sessions`, `POST /api/v1/rooms`, `GET /api/v1/rooms/:id`, `GET /api/v1/rooms/:id/ledger.csv`, `/healthz`, and a WebSocket at `/ws`. Guest identity is an HMAC-signed `HttpOnly` cookie. Origin is checked for the WebSocket and for cookie-authenticated writes. Message size is capped at 16 KB, commands are token-bucket limited, chat is limited to 5 messages / 10 s, table creation to 12 / hour / IP.
- **Snapshots** — the server sends each viewer a full snapshot after every change (tables are small). A reconnecting client receives the current snapshot immediately.

## Web (`apps/web`)

`useRoom` keeps one WebSocket with reconnect + backoff and a command promise per `commandId`. `fairness.ts` verifies proofs in the browser. Layout uses CSS container query units so the table scales to the space left over by the action dock; the seat anchors for ten seats come from the product spec (desktop) with a two-column portrait variant.

## Known simplifications vs the product spec

Single process with file persistence instead of Postgres/Redis + multiple workers with fencing; full snapshots instead of snapshot + delta streaming; no media server. See [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md).
