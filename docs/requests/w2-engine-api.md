# W2 -> W1/W3: contract notes
1. `CommandResult` ok results carry an extra boolean `queued` (not in the frozen type) for updateGame / updatePlayer / removePlayer: `(r as {queued?: boolean}).queued`. W1: please add `queued?: boolean` to the ok variant.
2. Log lines: the engine emits ALL log lines itself as `log` effects, including the two fairness lines (`Hand commitment (SHA-256): <hex>` right after `-- starting hand`, `Hand reveal: <n> exposed cards, root <hex>. Verify` under the finished hand's number at window close). W3 must NOT synthesise them again from commit/reveal effects.
3. `reveal` effect: emitted at result-window close (hand N). If a card is exposed afterwards (SHOW_HAND / RUC while waiting for Next Hand with auto-deal off) a SUPERSET `reveal` for the same hand is emitted again: W3 should store the latest per hand (indices never change value, verifier checks that).
4. Deal usage: hole cards appear as 2n entries (round 1 then round 2, one card each) so indices increase monotonically (matches `checkUsage`); rabbit cards are flagged `rabbit: true`.
5. Effects order in one result: `commit` before any `log` of the hand; `reveal` after the hand's last frame-relevant change.
6. `presence` with connected=true creates a `watching` player record (name "Guest") so HTTP routes can treat the cookie as known; `playerName` returns null only for never-seen ids.
7. Time bank: see w2-w4-semantics.md (client must send ATB).
8. Entropy draw order per hand: [random dealer on game start/restart], 51 shuffle draws (rejection sampled), 32-byte master salt, 12 hand-id letters; Monte-Carlo equity seeds from 16 bytes only when exact enumeration is too large.
