# How to verify a hand is fair

PokerThen shuffles the cards on its server. You do not have to take the server's word for it. Before any card of a hand is dealt, the server publishes a fingerprint of the shuffled deck. After the hand it publishes proof for the cards that were shown. Anyone can check that the two match.

- **Part 1** is for everyone. It needs no technical knowledge and takes about two minutes.
- **Part 2** says what a PASS proves and what it does not. Please read it. It is short, and it is honest about the limits.
- **Part 3** is for developers: the command-line check, a checker that uses none of PokerThen's code, and how to break a record on purpose.

## The idea in one minute

1. **Before the hand.** The server shuffles a fresh deck and writes down the order of all 52 cards. It publishes a short code that is a fingerprint of that list: the *commitment*. The hand log shows it as `Hand commitment (SHA-256): ...` before any card is dealt. If even one card in the list were different, the fingerprint would be different, so a deck that is changed after the fingerprint is published no longer matches it.
2. **After the hand.** For every card that was actually shown (the board, and any hole cards that were turned up) the server publishes the card, a secret random value for that card (its *salt*), and a short *proof*. The proof shows that this card, at this position, is part of the deck behind the fingerprint.
3. **Never published.** Folded or mucked hole cards, burn cards and cards that were never dealt. Each card is locked behind its own salt, so the proof for one card tells you nothing about the others.
4. **Chained.** Each hand's fingerprint includes the previous hand's fingerprint, so an old hand cannot be quietly rewritten later.

The Verify page does the maths in your own browser. The server only supplies the data.

---

## Part 1. Check a hand (no technical knowledge needed)

### Before you start

- Any phone or computer will do. Nothing to install, no account.
- You need a hand that has finished. The proof is published a few seconds after the result, when the next hand is about to be dealt. While a hand is being played, only its fingerprint exists.
- Recommended: save the fingerprint while the hand is being played. See [Make the check stronger](#make-the-check-stronger-save-the-fingerprint-as-the-hand-starts).

### Step by step, from the table

1. Play or watch a hand to the end.
2. Open the log. Press the **Log / Ledger** button at the bottom left of the table (on a phone the button says **Log**). On a computer you can press the `L` key. Make sure the **Full Log** tab is selected.
3. Find the hand. The log opens at the current hand, newest line first. The buttons at the bottom (for example `Hand #11 »` and `« Hand #13`) move between hands. Each hand starts with a line like `-- starting hand #12 ...`.
4. Look for two small grey lines inside that hand:
   - `Hand commitment (SHA-256): <64-character code>` is the fingerprint. It sits right under the `-- starting hand` line, before any card was dealt. Because the newest lines are on top, it is near the bottom of the hand's lines.
   - `Hand reveal: 9 exposed cards, root <64-character code>. Verify` appears a few seconds after the hand ends. The number is how many cards were published. It is the last line of the hand, so it is at the top. If it is not there yet, wait a few seconds and look again.
5. Press or tap **Verify** at the end of the reveal line. A new tab opens on the **Verify a hand** page and runs the check straight away.

### Step by step, from the Verify page

Use this when you do not have the table open, for example to check an older hand later.

1. Open the website's address with `/verify` at the end, for example `https://<site>/verify`.
2. In **Table link or id**, paste the table link (the address you use to join, which contains `/games/ptl...`). Pasting only the id, the part after `/games/`, also works.
3. In **Hand number**, type the hand's number (the `#12` in the log).
4. Press **Load**.

### Reading the result

The top of the result is one big word:

| You see | It means |
|---|---|
| **PASS** | Every check that could be run passed. |
| **FAIL** | At least one check failed. The line with the cross says which one. |
| **NOT REVEALED YET** | This hand's proof has not been published yet. Only the fingerprint exists. Look again after the hand ends. |

Under it is a list of checks. A **tick** means passed, a **cross** means failed, and a **dash** means skipped because the information was not available. In plain words:

| Line on the page | What it checks |
|---|---|
| Published commitment is well-formed | The three published codes (commitment, previous commitment, Merkle root) are proper 64-character codes. |
| Commitment appears in the hand log before any card | The fingerprint the server publishes now is the same as the one printed in the table's hand log, and that log line comes before the first blind and card. Dash if the log could not be loaded. |
| Chained to the previous hand | This hand's fingerprint includes the previous hand's fingerprint (for hand 1, a string of 64 zeros). Dash if the previous hand could not be loaded. |
| Reveal belongs to the committed hand | The published proof is for this table and this hand number, and carries the same fingerprint. |
| Commitment recomputes from previous commitment + Merkle root | The page works out the fingerprint itself from the published ingredients and gets the same code. |
| Revealed cards are consistent | Every published card is well-formed, and no deck position or card appears twice with different values. |
| **Every revealed card sat at its position in the committed deck** | The main check. Each card, with its salt and its position, is run through its proof and must end at the committed deck. A swapped card fails here. |
| Deal map is consistent with the revealed cards | The list of which deck positions were dealt has no repeats and covers every published card. It lists positions only, never the values of unshown cards. |
| Revealed cards match the hand log | The board and shown hole cards in the table's log are all among the proven cards, and no proven board card is missing from the log. Dash if the log could not be loaded. |
| Commitment was published before the reveal | The server's own timestamps put the fingerprint before the reveal. |

Below the list the page shows the three codes (**Commitment**, **Previous hand**, **Merkle root**) and **Cards revealed for this hand**, each with its deck position (`#0` is the first card of the shuffled deck) and the card.

**A PASS with dashes is a PASS for the checks that ran, but it checked less.** The two log checks need the table's hand log. If the page cannot load it (cookies blocked, server busy), they show a dash and the page says `hand log not available, log checks skipped`. You can paste the log text yourself under **Or paste the record and log yourself**.

### Check every hand at once

Below the result is a button, **Check the chain across all hands of this table**. It loads hand 1, 2, 3 and so on (up to 500) and checks that each fingerprint includes the one before. You get either `PASS: 25 hands, every commitment is chained to the one before it.` or `FAIL: hand #7 does not chain to hand #6.` This only compares fingerprints. It does not re-check the cards of every hand; for that, use the whole-table checker in Part 3.

### Make the check stronger: save the fingerprint as the hand starts

Everything above compares the server's data with the server's own log. To catch a server that changes its story afterwards, keep your own copy of the fingerprint:

1. While a hand is being played, open the log and take a screenshot of the `Hand commitment` line (or copy the code).
2. After the hand, run the check and compare the **Commitment** on the Verify page with your copy. They must be identical.

If the line is missing at the start of a hand, that is already a problem worth reporting.

### If you see FAIL

1. Check that you loaded the right table and hand number, then press **Load** again.
2. Try another hand of the same table. It matters whether one hand fails or all of them do.
3. Save the evidence: a screenshot of the page, and the record itself (open `https://<site>/api/games/<table-id>/fairness/<hand-number>` in your browser and save the text).
4. Tell the table owner and the developer. A FAIL means the published data does not add up. That can be a bug or something worse, and the page cannot tell which.

---

## Part 2. What a PASS proves, and what it does not

This is the sentence on the Verify page:

> The proof shows that the order of the deck was fixed before anyone saw a card and that every card shown came from that deck. It cannot by itself prove the shuffle was uniformly random; that is guaranteed by the open-source Fisher-Yates shuffle with rejection sampling and its tests.

"Guaranteed" there means that you can read the code and its tests. It is not something the proof can show. In more detail:

### What a PASS shows

- **The deck was fixed before the hand.** The fingerprint covers all 52 positions. After it was published, the server cannot change a card or the order without the fingerprint changing. (This holds for you only if you saw the fingerprint before the cards, which is why the log line comes first, and why saving it is worth the effort.)
- **Every shown card came from that deck, at that position.** A card that was swapped or moved fails its proof.
- **The log agrees.** The board and shown hole cards in the hand log are among the proven cards.
- **Hands are chained.** Each fingerprint includes the previous one. Rewriting an old hand would break every later fingerprint that players have already seen.
- **Unshown cards stay private.** Each card has its own secret salt, so the published proofs reveal nothing about the values of folded, mucked, burned or undealt cards.

### What a PASS does not show

1. **That the shuffle was random.** A server that picked a particular deck on purpose, published its fingerprint and dealt from it would also pass. Randomness rests on the shuffle code being what it claims to be: a standard Fisher-Yates shuffle that draws from the computer's secure random-number generator and avoids bias by rejection sampling (`packages/engine/src/rng.ts`), with tests for it (`packages/engine/test/fairness.test.ts`).
2. **That the website runs the code you can read.** The proof cannot tell you which code is running on the server. You are trusting that the published code is the deployed code.
3. **That the Verify page is honest.** The page comes from the same website. A dishonest site could serve a page that always says PASS. If you do not trust whoever runs the site, check on your own computer with the code from the repository, or with the checker in Part 3 that uses none of PokerThen's code.
4. **That nobody peeked.** The server does the shuffling, so the server, and whoever runs it, knows the order of the deck before it is dealt. The proof is about the deck not changing, not about hiding cards from the operator. The server is built never to send hidden cards to anyone else, and automated tests check that, but a test cannot prove what a live server does.
5. **Anything about cards that were not shown.** Folded and mucked hole cards, burn cards and the rest of the deck are never published, so there is nothing to check (they are still locked into the fingerprint).
6. **When the fingerprint was really published.** The "published before the reveal" line uses times the server reports about itself. To know the fingerprint existed before the cards, you have to have seen it in the log during the hand, or saved it.
7. **That the game was played correctly.** The proof is about the deck only. It does not check bets, pots, side pots or who won. The rules engine has its own tests, but the Verify page does not check the rules.
8. **That players played honestly.** It cannot see players who share cards or play from two devices.

### Getting the most out of it

- Save the `Hand commitment` line at the start of a few hands each session.
- Press **Check the chain across all hands of this table** now and then.
- Have someone you trust technically read the shuffle code and run the Part 3 checker on your table.

---

## Part 3. For developers

### 3.1 The record

```
GET /api/games/<table-id>/fairness/<hand-number>
```

It is public (no cookie). `<table-id>` is the part of the table link after `/games/` (it starts with `ptl`). It answers 404 for a hand that does not exist. An abridged example:

```json
{
  "gameId": "ptl...", "handNumber": 1, "handId": "abcdefghijkl",
  "commitment": "9344e568...163f",
  "prevCommitment": "0000000000000000000000000000000000000000000000000000000000000000",
  "root": "4fd1...",
  "committedAtMs": 1761500000000,
  "reveal": {
    "gameId": "ptl...", "handNumber": 1, "handId": "abcdefghijkl",
    "commitment": "9344e568...163f", "prevCommitment": "0000...", "root": "4fd1...",
    "dealOrder": ["<player id>", "<player id>", "<player id>"],
    "usage": [
      { "kind": "hole", "run": 1, "street": 0, "playerId": "<player id>", "indices": [0] },
      { "kind": "burn", "run": 1, "street": 1, "indices": [6] },
      { "kind": "board", "run": 1, "street": 1, "indices": [7, 8, 9] }
    ],
    "cards": [
      { "index": 7, "card": "Kc", "salt": "<64 hex>", "proof": ["<64 hex>", "<64 hex>", "<64 hex>", "<64 hex>", "<64 hex>", "<64 hex>"] }
    ],
    "revealedAtMs": 1761500060000
  }
}
```

`reveal` is `null` until the hand's result window closes. It can be published again with more cards in it if a player shows cards or uses rabbit hunting afterwards (until the next hand is dealt), so fetch it again if you expect more. The server strips any `deck` or `masterSalt` key from what it serves, and the engine never puts one there.

### 3.2 Run the checker

From a clone of the repository (Node.js 22 or newer, `npm install` done):

```bash
npm run verify-hand -- hand.json
npm run verify-hand -- https://<site>/api/games/<table-id>/fairness/<hand-number>
```

The `--` hands the argument to the script. Example output (the long hash values are shortened here):

```
PASS  cards: 9 revealed cards are well-formed.
PASS  proofs: Every revealed card's Merkle proof leads to the committed root.
PASS  hash: SHA-256 of preimage = 9344e5...163f; published commitment = 9344e5...163f.
PASS  chain: prevCommitment equals the previous hand's commitment.
PASS  usage: 14 deck positions consumed in order.
```

| Exit code | Meaning |
|---|---|
| 0 | Every check passed. |
| 1 | A check failed. (A stack trace instead of PASS/FAIL lines means the file or URL was not a fairness record.) |
| 2 | No argument was given. |
| 3 | The hand has not been revealed yet (`reveal` is `null`). |

### 3.3 What the checker checks, and what it does not

| Line | Check |
|---|---|
| `cards` | Every revealed card is well-formed (position 0 to 51, valid card code, 6 proof hashes) and no position or card is revealed twice with different values. |
| `proofs` | Each leaf (`PT1L\|gameId\|hand\|handId\|position\|card\|salt`) folded up its 6 sibling hashes equals `reveal.root`. |
| `hash` | `SHA-256("PT1C\|gameId\|hand\|handId\|prevCommitment\|root")` equals the record's `commitment`, which is the value that was logged before the hand. |
| `chain` | Only a consistency check: the record's `prevCommitment` equals the one inside `reveal`. It does **not** fetch the previous hand. |
| `usage` | Deal map structure: positions are valid, unique and increasing, and the first round of hole cards follows `dealOrder`. |

It does **not** read the hand log (so it cannot tell whether the commitment was logged before the hand, or whether the logged board matches), and it does not check timing. The `/verify` page does those. To check the chain with this tool, run it on hand N-1 and compare that record's `commitment` with hand N's `prevCommitment` (hand 1 must have 64 zeros), or use the whole-table checker below.

### 3.4 Check a whole table without any PokerThen code

This script uses only Node's built-in `crypto` and `fetch` (Node 18 or newer). It re-implements the construction from [FAIRNESS-MERKLE.md](FAIRNESS-MERKLE.md), so a bug in PokerThen's own verifier cannot hide here. Save it as `audit.mjs`:

```js
// usage: node audit.mjs https://<site>/api/games/<table-id>/fairness
import { createHash } from "node:crypto";

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const base = process.argv[2].replace(/\/$/, "");
let prev = "0".repeat(64), bad = 0;

for (let n = 1; ; n++) {
  const res = await fetch(`${base}/${n}`);
  if (res.status === 404) break;
  const rec = await res.json(), r = rec.reveal, problems = [];
  if (rec.prevCommitment !== prev) problems.push("not chained to the previous hand");
  if (r) {
    for (const c of r.cards) {
      // leaf = SHA256("PT1L|table|hand|handId|position|card|salt"), folded up the 6 proof hashes to the root
      let h = sha(["PT1L", r.gameId, r.handNumber, r.handId, c.index, c.card, c.salt].join("|")), i = c.index;
      for (const sibling of c.proof) { h = i % 2 ? sha(`PT1N|${sibling}|${h}`) : sha(`PT1N|${h}|${sibling}`); i >>= 1; }
      if (h !== r.root) problems.push(`card at position ${c.index} does not lead to the root`);
    }
    // commitment = SHA256("PT1C|table|hand|handId|previous commitment|root")
    const commitment = sha(["PT1C", r.gameId, r.handNumber, r.handId, r.prevCommitment, r.root].join("|"));
    if (commitment !== rec.commitment) problems.push("commitment does not match");
  }
  console.log(`hand ${n}: ${problems.length ? "FAIL " + problems.join("; ") : r ? "PASS" : "committed, reveal not published yet"}`);
  bad += problems.length;
  prev = rec.commitment;
}
process.exit(bad ? 1 : 0);
```

```bash
node audit.mjs https://<site>/api/games/<table-id>/fairness
```

It prints one line per hand and exits 1 if anything fails. Like the CLI, it cannot know what the log showed during the hand, so keep your own copy of the fingerprints (Part 1) if that matters to you.

### 3.5 Doing it by hand

All hashes are SHA-256 in lowercase hex of a UTF-8 string, with fields joined by `|` (full details in [FAIRNESS-MERKLE.md](FAIRNESS-MERKLE.md)):

```
salt[i]    = SHA256("PT1S|" + masterSalt + "|" + i)       masterSalt is never published; you get salt[i] for shown cards
leaf[i]    = SHA256("PT1L|" + gameId + "|" + handNumber + "|" + handId + "|" + i + "|" + card[i] + "|" + salt[i])
node       = SHA256("PT1N|" + left + "|" + right)         tree over 52 leaves padded to 64 with SHA256("PT1PAD")
commitment = SHA256("PT1C|" + gameId + "|" + handNumber + "|" + handId + "|" + prevCommitment + "|" + root)
```

`prevCommitment` is 64 zeros for hand 1. A proof is the 6 sibling hashes from the leaf up. At each step, if the position is even the current hash is the left child, otherwise the right child, and the position is halved. With standard tools, for example the commitment:

```bash
printf '%s' 'PT1C|<gameId>|<handNumber>|<handId>|<prevCommitment>|<root>' | shasum -a 256
```

The result must equal the `commitment` in the record (use `sha256sum` where `shasum` is not installed).

### 3.6 Break it on purpose

Save a revealed record as `hand.json`, then try each of these and run the checker again:

- Change one card in `reveal.cards[0].card`, for example `"Kc"` to `"Kd"`. The `proofs` line fails.
- Change one character of `commitment` at the top of the record. The `hash` line fails.
- Change one character of a `salt` or of a hash inside a `proof`. The `proofs` line fails.
- Set `reveal` to `null`. The checker exits with code 3 and prints `hand not revealed yet`.

You can paste a tampered record into the Verify page under **Or paste the record and log yourself** and watch it say FAIL.

### 3.7 Reading the deal map

`usage` lists every deck position that was dealt, with no card values:

- Hole cards: one at a time, clockwise, starting with the first active seat left of the dealer, two rounds. With `n` players, positions `0` to `2n-1`; `dealOrder` is the list of player ids in that order.
- Then, for each street, one burn card followed by the street's cards: flop 3, turn 1, river 1. With 3 players the burn cards are positions 6, 10 and 12, the flop is 7 to 9, the turn is 11 and the river is 13.
- Run it twice continues from the next unused position (burn card, then the remaining streets of the second run). Rabbit hunting cards come after, flagged `"rabbit": true`.

Only positions that were exposed to somebody appear in `cards`. The rest are listed in `usage` by position, so you can see that, for example, positions 1 and 4 were dealt to a player who folded, without learning what they were.

### 3.8 Where the code is

| What | Where |
|---|---|
| Commitment, Merkle tree, proof checking (shared by server and browser) | `packages/shared/src/fairness.ts` |
| Shuffle (Fisher-Yates, rejection sampling) and salts | `packages/engine/src/rng.ts` |
| Commit and reveal built by the engine; deal order and exposed cards | `packages/engine/src/fairness.ts`, `packages/engine/src/hand/flow.ts` |
| Storing and serving records (`/api/games/:id/fairness/:hand`) | `apps/server/src/fairness/store.ts`, `apps/server/src/http/router.ts` |
| The Verify page and its checks | `apps/web/src/pages/Verify.tsx`, `apps/web/src/pages/verify/check.ts` |
| The command-line checker | `scripts/verify-hand.ts` |
| Tests: shuffle bias, commit before cards, only exposed cards revealed, tamper detection | `packages/engine/test/fairness.test.ts` |
| Tests: no hidden card in any message | `packages/engine/test/leak.test.ts`, `apps/server/test/leak.test.ts`, `tests/e2e/scenarios/i-E10-leak-real-engine.mjs` |
| Test: `/verify` passes a real hand and fails tampered ones; CLI exit codes | `tests/e2e/scenarios/i-E05-verify.mjs` |
