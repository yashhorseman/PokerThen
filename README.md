# ♠ PokerThen

Private Texas Hold'em tables with a **provably fair** shuffle. No accounts, no server, no ads — it's a static site you can host on GitHub Pages.

**How to play:** open the site → enter a nickname → *Create new game* → click **Copy invite link** and send it to your friends → everyone clicks an empty seat → host clicks **Start game**.

## Features
- PokerNow-style lobby: one click creates a table and gives you a shareable link (`…/PokerThen/#ABC123`)
- No-limit Hold'em, 2–10 players, blinds / ante, correct heads-up rules, min-raise & short all-in rules, side pots
- **Run it twice** (all players still in the hand must agree), **rabbit hunting**, **show cards** (either / both), check/fold pre-action, action timer, sit out, add chips, stand up
- Host controls: blinds, ante, buy-in range, timer, pause, edit stacks, kick
- Reconnect-safe: refresh and you keep your seat and stack; the host's table is saved and resumes when they reopen the link
- Chat + hand log, mobile friendly

## Why it's fair
1. **Unbiased shuffle** — Fisher-Yates driven by `crypto.getRandomValues` with rejection sampling (no modulo bias).
2. **Commit → reveal** — before any card is dealt, the table publishes `SHA-256(deck | salt)`. When the hand ends the deck and salt are revealed. *Every player's browser* re-hashes them and checks that the hash matches, the deck has 52 unique cards, and the board and hole cards were dealt off the top of that exact deck. The 🔒 button in the top bar shows the verification log.
3. **Open source** — the whole thing is ~1,500 lines of readable JS, no hidden logic. `node test/engine.test.js` checks hand ranking, shuffle uniformity (chi-square), SHA-256 and chip conservation over thousands of simulated hands.

**Honest limitation:** with no server, the *host's browser* is the dealer, so technically the host's machine knows the deck (anyone could with dev-tools). The commitment guarantees the deck can't be swapped or altered after the hand starts, and that nothing is "rigged" by the software, but it can't stop the host peeking. For a friend group, that's the usual trade-off; if you want to be strict, let someone who isn't playing host (they can sit out), or rotate the host. Fully trustless "mental poker" needs a much more complex protocol.

## How it works
GitHub Pages only serves files, so multiplayer is peer-to-peer (WebRTC via [PeerJS](https://peerjs.com)). The host's browser runs the game engine (`engine.js`); other players connect to the host and receive a personalised view (they never receive other players' hole cards until shown). The free PeerJS cloud is used only for the initial handshake. If a player can't connect (rare, strict corporate/mobile NATs without a TURN server), try another network or Wi-Fi.

- If the **host closes the tab, the game pauses** for everyone; reopening the invite link in the same browser resumes it.
- Host and players should use up-to-date Chrome/Safari/Firefox.

## Deploy on GitHub Pages
Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)` → Save. Your site will be at `https://<user>.github.io/PokerThen/`.

## Files
| file | what |
|---|---|
| `index.html`, `style.css` | page + PokerNow-like styling |
| `app.js` | networking (PeerJS), UI, client-side fairness verification |
| `engine.js` | game rules, RNG, SHA-256, hand evaluator (also runs in Node) |
| `test/engine.test.js` | tests |
