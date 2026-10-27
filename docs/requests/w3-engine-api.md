# W3 request: engine/contract notes (no change strictly required)

1. `currentOrNextConfig` / `playerEdit` (added by W1 as optional EngineApi methods): the server uses them when present, otherwise falls back to `frame.table.config` + `configQueued` and `{player, enqueuedChanges: []}`. W2 should implement both so the owner screens show the queued config and per-player queued changes.
2. (engine already sets `queued` on the result; fine) `update_player` responds `{queued}`: server uses `(CommandResult as any).queued` if the engine sets it, else the heuristic "stackChange != 0 and stack unchanged in the frame". Suggest adding optional `queued?: boolean` to the ok result of `CommandResult` (updatePlayer/updateGame).
3. The server answers `ME` (mood emoji) itself (nEM/rEM, in-memory); the engine never sees it. Engine should ignore `ME` if it does arrive.
4. `log_v3` returns entries oldest-first (ascending createdAt); W7 renders newest-first by reversing.
5. (verified against engine rng.ts) DEV_FIXED_DECKS assumes the shuffle draws 32-bit big-endian words via `entropy(4)` (or n*4 bytes at once), i=51..1, `j = u % (i+1)`, and that the salt draw (any size) follows the shuffle. If W2's rng.ts differs, tell W3.
6. Presence commands are sent for every connecting cookie id, including unseated watchers; the engine should answer ok (no-op) for unknown ids.
7. `engine.frame(state, viewerId, now)` is always called with a non-null viewer (cookie-derived id), `null` only for config reads.
8. Real engine landed: entropy order per hand is [random dealer on first hand], shuffle, salt, hand id. DEV_FIXED_DECKS file entries may be `{deck:[52 codes], pre:[dealerIndex]}` (first hand needs `pre:[0]`) or a bare 52-code array.
