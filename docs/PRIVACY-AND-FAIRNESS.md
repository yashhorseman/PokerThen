# Privacy and fairness

## Who can see what

| Data | Server | Host | Seated player | Viewer |
|---|---|---|---|---|
| Own hole cards | yes | own only | own only | none |
| Opponents' hole cards | yes (it deals) | **no** | only if shown | only if shown |
| Undealt deck | yes, encrypted at rest | **no** | **no** | **no** |
| Board, pots, stacks | yes | yes | yes | yes |
| Rabbit cards | yes | only if they clicked reveal | only if they clicked reveal | no |

The host is just a player with admin buttons. Unlike a peer-to-peer design, the host's browser never holds the deck.

Clients never receive anyone else's hidden cards: the server builds a per-viewer snapshot and simply omits them (they are not hidden by CSS). `apps/server/test/server.test.ts` asserts that no raw snapshot ever contains another player's hole cards and that the deck/salts never appear.

## Fairness

- **Shuffle**: `crypto.randomInt` Fisher–Yates over 52 cards, fresh per hand. Per-card salts are 96-bit random values.
- **Commitment**: before the first card is dealt, the table publishes `root = Merkle(SHA-256(leaf|index|card|salt))` over all 52 positions. `snapshot.fairness.commit`.
- **Proofs**: board cards, shown hole cards, burn cards (after the hand), each viewer's own hole cards, and rabbit cards (only to whoever revealed them) come with a Merkle path.
- **Verification**: the browser (`apps/web/src/fairness.ts`) recomputes the root from each proof; checks card positions against the dealing procedure in `docs/ARCHITECTURE.md`; checks what is displayed equals the committed card; checks cards are unique. A hand is marked ✓ only if all pass; otherwise the 🔒 button turns red.
- **Chip accounting**: stacks + pot + cashed-out chips always equal chips issued; property tests assert this after every command over thousands of random hands.

## Limits (be honest with your friends)

- Whoever operates the server process could read the deck while a hand is live. Commitment proves it was fixed beforehand and wasn't changed after seeing the betting, not that the operator didn't peek.
- The verifier cannot prove undealt/folded cards were "random", because it never sees them; it proves they were fixed. Fair shuffling itself rests on the open-source RNG code.
- Guest identity is a cookie. Clearing cookies or switching browsers is a new person; a host can approve a returning player into a seat and top up their stack.

## Data kept

Per table: members' chosen nicknames, ledger, log and chat (last 600 lines), in `DATA_DIR/rooms/<id>.json`. Tables inactive for 24 h with nobody connected are archived read-only. No analytics, no third-party requests (fonts are self-hosted).
