# 06 - Rules engine (PokerNow private tables)

STATUS: PARTIAL, UPDATED 2026-10-25 21:09 after table became available (section 0 = LIVE OBSERVATIONS; sections 1-3 are the earlier documented/client-JS material). Lock held ~21 min then released; table left with only Dave seated, game waiting, host unseated (busted). Everything below is labelled
DOCUMENTED (official blog), CLIENT-JS (read from the public game.bundle, i.e. what the client renders/derives; the
engine itself is server-side and not visible) or UNKNOWN. Nothing is invented.


## 0. LIVE OBSERVATIONS (table pgl2LtmWTm..., 4 players: yash=host seat1, Bob 2, Carol 3, Dave 4; blinds 10/20, stacks 1000, config: Rabbit=Yes, RIT=Ask Players, UTG straddle allowed=Yes, auto-start=Yes, limit 20 s, time bank 10 s / 10 hands)
Evidence: research/evidence/rules/ (16-cfg, 18-started, 20-showdown, 23-rit-*, 24-rit-*, 27-rit-*, 28-run2-*.png)
Guests joined by link with NO captcha; seat request shows to joiner "You requested this seat. Wait for the owner approval." (OK), to owner a dialog `The player "Bob" wants to join the game!` with Intended Stack, "do not show this again?", REJECT / IGNORE / ACCEPT; after accept: "The player was approved successfully!". Pre-start owner buttons SHUFFLE SEATS / START GAME.

### Log (Session Log, newest first in UI; each row HH:MM + text; exact verbatim lines)
- `The player Bob requested a seat.` / `The admin approved the player Bob participation with a stack of 1000.`
- `Game Config Changes * Allow Straddle: off » on * Nit Minimum Players: off » 3 * Allow Rebuy: off » off * Rabbit Hunt: off » on * Allow Run it Twice: no » ask players`
- `The player Dave joined the game with a stack of 1000.`
- `-- starting hand #1 (id: jxmorahjxvqp)  No Limit Texas Hold'em (dealer: Carol) --`  (two spaces before "No Limit")
- `Player stacks: #1 yash (1000) | #2 Bob (1000) | #3 Carol (1000) | #4 Dave (1000)`
- `Your hand is 6♥, 8♦` (own cards only, in that viewer's log)
- `Dave posts a small blind of 10` / `yash posts a big blind of 20`
- `Bob folds`, `Carol calls 20`, `yash checks`, `yash bets 20`, `Carol raises to 960 and go all in`, `Dave calls 960 and go all in`, `yash calls 960`, `yash calls 120 and go all in`, `Bob raises to 1000 and go all in`
- `Flop:  [7♠, 9♣, 5♦]` (two spaces) ; `Turn: 7♠, 9♣, 5♦ [9♠]` ; `River: 7♠, 9♣, 5♦, 9♠ [6♣]` (previous board then new card in brackets)
- Run 2: `Flop (second run):  [9♥, 10♠, 4♥]`, `Turn (second run): ...`, `River (second run): ...`
- Showdown: `Dave shows a 3♦, Q♥.` ; `yash shows a 6♥, 8♦.`
- Win: `yash collected 120 from pot with Straight, 9 High (combination: 5♦, 6♣, 7♠, 8♦, 9♠)`; `Dave collected 2900 from pot with Two Pair, 5's & 2's (combination: 10♣, 2♣, 2♠, 5♠, 5♣)`
- Run-it-twice win: `Dave collected 180 from pot with Two Pair, A's & 7's (combination: 8♥, 7♣, 7♦, A♣, A♠)` ; `Dave collected 180 from pot with Pair, A's on the second run  (combination: 8♣, 9♥, 10♠, A♣, A♠)` (two spaces before "(combination") ; same pair of lines again with 880 (side pot) -> each pot gets one line per run.
- `-- ending hand #1 --`
- RIT: `Remaining players decide whether to run it twice.` ; `Bob chooses to  run it twice.` (two spaces) ; `All players in hand choose to run it twice.` ; if not all: `Some players choose to not run it twice.`
- `The player Carol quits the game with a stack of 0.` (busted player leaves seat automatically)
- Timeout fold/check produce plain `Bob folds` / `Dave checks` (no timeout wording).

### Dealer / blinds / order (observed)
- Hand1 4-handed dealer Carol(seat3): SB Dave(4), BB yash(1); first to act Bob(2) = UTG; BB gets option ("yash checks"). Postflop first to act = SB (Dave). Hand2 dealer moved to Dave: SB yash, BB Bob, UTG Carol. Hand3 (Carol busted, 3-handed) dealer yash, SB Bob, BB Dave, first to act yash (UTG=button). Hand4 dealer Bob, SB Dave, BB yash, Bob first. Button moves one active seat clockwise per hand. Posted blinds appear in the log in order BB then SB (log newest-first), chips shown as yellow bubbles; D marker.
- Completed small blind: `Dave calls 20` when SB completes (shown as call of 20 total in the log).
- Heads-up, dead button, missed blinds, straddle: NOT TESTED.

### Timers
- Decision limit 20 s then time bank auto-activates (client pref "Auto activate your extra time" default on; button shows "EXTRA TIME ACTIVATED"); after ~30 s total (20 + 10 bank) the server acts: FOLD if a bet is faced (Bob), CHECK if free (Dave). Folded/timed-out Dave facing nothing: `Dave checks`; Dave left holding a call decision at hand 3 for ~25 s then `Dave folds`.
- Pre-action buttons visible off-turn: CHECK OR FOLD, CALL x, CHECK, FOLD; clicking CALL off turn queues it.
- Bet panel: input + MIN RAISE, 1/2 POT, 3/4 POT, POT, ALL IN, -, +, submit labelled `Raise`/`Bet` and BACK. All-in raise log: `raises to N and go all in`. Call button for all-in shows `ALL IN 120`; calling a bigger bet shows `CALL 990`. Stack of a short caller shown as `All In` under name.
- Seat badges: folded `FOLD` with X icon; check/other last action text under seat (e.g. "check"). Own hand strength is shown live at all times in own seat label (e.g. `STRAIGHT`) once board dealt.
- Pot display: centre number = pot collected from previous streets (0 during first betting round); `total N` small label above right = sum including current bets. At showdown centre shows total, then 0 after award.
- Uncalled bet: hand 4: Dave called Bob's 1000 with 2880 stack: log `Dave calls 1000`; in hand2/hand4 no uncalled-return needed. NOT TESTED separately.

### Showdown / reveal
- With action remaining (hand 1): reveal order = first player left of dealer who is in the hand (Dave), then yash; Carol (loser, bet last no) mucked automatically and never shown; Dave (loser) did show because he was first to act. Log order matches. Winner "collected" line after shows.
- All-in situation: "Reveal all hands when no more action is possible?" (setting default shown as active) -> hole cards of all non-folded players are shown face-up immediately when RIT decision starts (before board runs): log `yash shows ...`, `Bob shows ...`, `Dave shows ...` BEFORE flop line, in seat order starting from the seat after dealer? (observed hand2: yash, Carol, Dave; hand4: yash, Bob, Dave = seat number order, NOT from dealer).
- After the hand a "SHOW ALL CARDS" green button (hotkey s) with per-card buttons "2♥" "Q♦" (hotkeys 1 and 2) appears bottom right for a player whose hand was not shown (loser/folded). Folded player's hand not shown automatically.
- Board streets timing in all-in runout: RIT prompt visible ~9-10 s countdown ("Waiting for run it twice decisions (9s)"); after all answered: hole cards reveal, flop ~1.1 s later, turn +3.3 s (observed 33.1 -> 36.5 s from flop), river +3.3 s; run 2 flop after ~4.3 s pause, same 3.3 s spacing; award ~4 s after last card; next hand ~8 s after award (new hand started within ~10 s).
- In a single run all-in (when RIT not agreed): flop 1.1 s after reveal, turn +1.1? (observed flop at 31.99 s, turn 33.14, river 36.5).

### Hand names and live equity (UNEXPECTED, now OBSERVED)
- Once all-in and cards revealed, each non-folded player's seat shows a green/red pill with a win-probability percentage (e.g. `100%`, `0%`, `87%`) above the cards, updated on every street (3-way preflop all-in: yash 11%, Bob 19%, Dave 39%->70% after cards, flop: 5%/13%/79%, turn 1%/12%/87%, river 0/0/100%). Green pill for the leader (>=50%?), red for others. Percentages shown per player, sum = 100 in run 1 equity. In RIT (two runs) pills show equity; during run 2 stays based on current-run board.
- Under each player's cards a red label shows the current hand name in short form: `TWO PAIR (A,7)`, `PAIR (A)`, `PAIR (4)`, `HIGH CARD`, `TWO PAIR (5,2)`, `STRAIGHT`. With two runs the label has two rows `#1 TWO PAIR (A,7)` / `#2 PAIR (A)`. Winners get a trophy badge with win count (e.g. `1`).
- Log hand names: `Straight, 9 High`, `Two Pair, 5's & 2's`, `Two Pair, A's & 7's`, `Pair, A's` (+ ` on the second run`), each followed by `(combination: five cards ascending-ish)` (combination listed low to high with pair kickers e.g. `10♣, 2♣, 2♠, 5♠, 5♣`).
- Cards in table text show board with second run row beneath first (run-2 row offset below run-1); both rows visible until award.

### Run it twice (Ask Players) observed behaviour
- Triggered when no more betting possible and board not complete (even preflop). Players still in the hand (all-in or not folded) get prompt bottom right: `Run it Twice?` YES / NO (box with green/red borders). Owner/other text: `Waiting for run it twice decisions (9s)`. Timeout of ~10 s -> treated as not agreeing (hand 2: prompt expired in ~10 s and board ran once; log `Some players choose to not run it twice.`). With all three clicking YES: `All players in hand choose to run it twice.`, run 1 (flop turn river), then run 2 full flop/turn/river (new cards; burn invisible).
- Pot split: each pot (main 360 and side 1760) is split in half per run: 180+180 and 880+880. Each run's winner collects half; odd chip case UNTESTED.
- Folded players (Bob in hand 2) are not prompted.
- Hand 2 (3 all-in + 1 folded): result single run Dave 2900.

### Players leaving / busting
- Busted players are removed from the table and their seat shows SIT: `The player Carol quits the game with a stack of 0.`; 1 player left -> table shows "Waiting for others" and START not needed.

### Scenario results (executed)
| # | Scenario | Result |
|1| 4-handed hand to showdown, check/call | executed: see log above; dealer/blinds as listed |
|13| timer expiry | executed: fold when facing bet, check when free, after 20 s + 10 s time bank |
|11| showdown order/auto-muck | executed (hand 1) |
|17| RIT Ask Players: all yes, with side pot; one declines/timeout | executed (hands 2,4) |
|8| side pot (120 vs 1000 vs 1000) | executed: main 360 / side 1760 |
|2,3,4,5,6,7,9,10,12,14,15,16,18,19 | NOT executed (lock window ended) |

## 0b. LIVE OBSERVATIONS, SESSION 2 (hands #5-#16; 21:14-21:26; evidence 30-41 *.png)
Config this session: UTG straddle allowed + every player pref "Auto Straddle 2 Big Blinds when UTG?" = YES (Options > Preferences). Game ended with owner STOP (confirm text: "You are about to stop the game. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven."; log `The admin yash enqueued the game stop on next hand.`); table left stopped: seats yash 850, Bob 20, Carol 1270, Dave 4670, buttons SHUFFLE SEATS / START GAME. Hand numbers continue across stop (#16 last).

### Straddle (UTG, 2BB)
- Log: `yash posts a straddle of 40` after the BB line (order of posting: SB, BB, straddle). Posted automatically for UTG player with pref on and table allowed; stack drops by 40 (1000 -> 960 shown).
- Preflop action starts with the player LEFT of the straddler; straddler acts LAST preflop and has an option (CHECK or RAISE) if no raise. Buttons for others: `CALL 40`; SB `CALL 30`; BB `CALL 20`.
- Min raise after a straddle = straddle + last raise size (40+20) -> panel shows `60`; later min re-raise = previous raise increment (Carol raised to 60, Dave's MIN RAISE shows 80).
- 3-handed UTG = dealer(button) seat posts the straddle? In 3-handed hand 8 Dave (UTG left of BB) straddled. Heads-up (hand 13: dealer yash = SB): `yash posts a small blind of 10`, `Dave posts a big blind of 20`, `yash posts a straddle of 40` (the dealer/SB straddled as UTG); Dave (BB) acted first preflop (`CALL 20` = completes to 40), then `Dave calls 40`, `yash checks`.
- Log "calls N" / "raises to N" N = the player's TOTAL bet this street (e.g. `Carol calls 60`, `Dave raises to 195`).
- Preset sizes: `3/4 POT` raise = 195 when pot was 60+60+... (value shown as typed in input; submit button label `Raise` for raise and `Bet` when opening).

### Heads-up, button, dead button, missed blinds
- Heads-up (2 players): dealer = SB (posts 10, acts first preflop when no straddle; with straddle BB acts first); non-dealer = BB acts FIRST postflop (Dave acted first on flop/turn).
- Button moves one seat clockwise per hand to the next occupied seat; hand header `-- starting hand #9 (id: ...)  No Limit Texas Hold'em (dead button) --` appears (instead of `(dealer: Name)`) when the button seat is empty (the player who held that seat left): hand 9 had Bob's seat 2 empty; SB = next occupied seat (Carol) and BB Dave: nobody got a free pass.
- `Dead Small Blind` log line (no amount) when the SB seat holds an away/stood-up player (hand 10: dealer Carol, SB seat 4 Dave away): no SB posted, `Eve posts a big blind of 20` only.
- Returning player owes a missed blind: Dave `I'M BACK` -> status `IN NEXT HAND`; next hand (dead button header) log `Dave posts a missing small blind of 10` (posted in addition to nothing else; Dave then is in the hand and could act: he called 40 etc.).
- New player joining mid-orbit (Eve sat seat 8 during hand 8): status `IN NEXT HAND`; log `The player Eve joined the game with a stack of 1000.` at hand boundary; she was NOT charged any blind when she first entered UTG (hand 9) even though she was between BB and button... (she was UTG: no blind owed).
- Stop game: hard stop randomizes dealer + forgives missed blinds (confirm text above).

### Leaving / away
- Leave seat mid-hand: confirm dialog text `Are you sure that you want to leave your seat? You will enter in check/fold mode until the hand's end.` with CANCEL / CONFIRM. Seat shows `QUITTING`; on his turn auto `Bob folds`; blinds already posted stay in pot; at hand end log `The player Bob quits the game with a stack of 870.` (stack preserved) and seat becomes empty.
- AWAY button: seat shows `AWAY`, buttons become `I'M BACK`; mid-hand the away player is auto-checked/folded on turn (`Dave checks`); he still reaches showdown if he checked down and shows his cards (`Dave shows a 2♦, 9♥.`). At hand end (Deal hands to away players = default NO): `The player Dave stand up with the stack of 4000.` and he is skipped next hand (dead SB). Clicking `I'M BACK` -> `IN NEXT HAND`, then `The player Dave joined the game with a stack of 4000.`
- Bust: `The player Carol quits the game with a stack of 0.` seat freed.

### Uncalled bet / rabbit hunt / show
- `Uncalled bet of 120 returned to Carol` then `Carol collected 240 from pot` (no hand description when everyone folded). Also when a raise is partly uncalled: `Uncalled bet of 135 returned to Dave`; BB uncalled: `Uncalled bet of 20 returned to yash`/Carol after all fold preflop with straddle.
- Rabbit hunting: after a fold-ended hand every seated player (including the winner) gets a green `REVEAL` button (hotkey `H`) where the undealt cards would be, plus `SHOW ALL CARDS` (hotkey S). Window = until the next hand starts (~8-10 s; auto start). Clicking Reveal shows all remaining board cards (flop+turn+river, 5 cards if preflop fold) to THAT viewer only; table text shows `Some players are seeing the undealt cards.`; own hand label shows `(RH: PAIR (K))` / `(RH: HIGH CARD)` i.e. what he would have. Log (visible to all): `Undealt cards:  [A♥, 9♠, 4♠, 3♥, J♦]` (two spaces). Other players' screens unchanged unless they also press Reveal.
- Folded players' hole cards are not shown; SHOW ALL CARDS / per-card toggles show them.
- Clicking FOLD when CHECK is free does not fold (it was treated as a check/needs confirmation): hand 13 `Dave checks`.

### Showdown order (hand 9, dead button): Carol (first seat left of dead button) showed, then Dave, then yash (winner); Eve (losing last, behind) mucked. => standard sequential showdown starting left of button / last aggressor rules; players who cannot win by showing simply muck without log line. Winner line example: `yash collected 80 from pot with Pair, K's (combination: 5♣, 7♣, Q♦, K♦, K♥)`.

### Run it twice, mixed answers
- 2 players all-in (Carol all-in, Dave covers): prompt to both; `Dave chooses to not run it twice.` then immediately `Some players choose to not run it twice.` (no wait for the others), single run; hands shown `Carol shows ...` `Dave shows ...` then flop, turn, river.
- Hand 4 earlier: 3 players with side pot all YES -> two runs with pots split per run (see section 0). Prompt countdown ~10 s; default answer on timeout = No.

### Timers
- 20 s decision + 10 s bank: confirmed again (idle player auto-checks at ~30 s). Per-viewer `EXTRA TIME ACTIVATED` appears on the button as soon as the decision clock expires (auto-activate pref default on); button label before that `ACTIVATE EXTRA TIME (Ns)` per client code. Refill rule (10 hands) not measured.

### Short all-in no-reopen, odd chip, burn cards, stack-request approval, time-bank refill: NOT observed (see UNKNOWN).

## RULES SPEC (implementation rules derived from observation; [C]=client-JS inference, [D]=documented)
1. Seats 1-10; 2+ players needed; owner presses START GAME; hand numbers increase for the table lifetime. Hard stop => random dealer, forgiven missed blinds.
2. Button moves clockwise to the next occupied seat each hand; if the seat that should hold the button is empty the hand is labelled "(dead button)" and blinds are taken from the next occupied seats after it (SB seat may be empty/away -> "Dead Small Blind", nothing posted).
3. Blinds: SB then BB, logged `X posts a small blind of N` / `X posts a big blind of N`. Heads-up: dealer is SB; BB acts first postflop; preflop SB(dealer) first (unless straddle).
4. Straddle (if allowed by table AND the UTG player has pref on): UTG posts 2xBB `X posts a straddle of 40` right after BB. Preflop action starts left of the straddler, straddler last with raise option. Min raise-to = straddle + last increment (initially BB).
5. Min raise-to = highest bet + size of last full raise; min bet = BB. A raise below that is only possible as all-in. Players already acted can re-raise only if a full raise happened [C: server list cRPI].
6. Preflop min open raise: 2BB (e.g. 40) with panel MIN RAISE; presets 1/2 POT, 3/4 POT, POT, ALL IN; "Auto trim excess bets" caps to effective opposing stacks and uncalled amount is returned `Uncalled bet of N returned to X`.
7. Log amounts "calls N"/"raises to N"/"bets N" are the player's street total; `... and go all in` suffix when stack is exhausted.
8. Streets log: `Flop:  [a, b, c]`, `Turn: a, b, c [d]`, `River: a, b, c, d [e]`. Between streets ~1.1 s (all-in runout) with 3.3 s spacing between cards in runouts; ~4 s after last action before award, ~8-10 s before next hand (auto start).
9. Showdown: sequential reveal starting with first active seat left of the button (or last aggressor); a player who cannot beat the best shown hand mucks (no log). When all are all-in, all non-folded hands are shown before the board runs (`X shows a c1, c2.`). Winners: `X collected N from pot with <Hand> (combination: five cards)`; fold wins: `X collected N from pot`.
10. Hand text: `Pair, K's`, `Two Pair, 5's & 2's`, `Straight, 9 High`, appended ` on the second run` for run 2 (with two spaces before `(combination:`). Seat badge (short): `TWO PAIR (A,7)`, `PAIR (4)`, `HIGH CARD`, `STRAIGHT`.
11. Live equity: from all-in reveal on, each non-folded player has a % pill (rounded integers summing ~100) recomputed after each street; leader green, others red.
12. Run it twice (Ask Players): when no further betting possible and board incomplete, prompt `Run it Twice?` YES/NO to non-folded players, 10 s; any NO (or timeout) => single run (`Some players choose to not run it twice.`); all YES => `All players in hand choose to run it twice.`, run 1 then second run of remaining streets (flop included if preflop); each pot split half per run: 360 -> 180/180, side pot 1760 -> 880/880.
13. Folded last-opponent hands end immediately with uncalled-bet return then award; no showdown.
14. Rabbit hunting (if enabled): after hands that end before river, REVEAL (H) per viewer for the remaining cards until next hand; log `Undealt cards:  [..]`.
15. Timer 20 s + 10 s bank (config); on expiry auto fold if facing a bet else check; log plain `folds`/`checks`.
16. Leave seat mid-hand = check/fold until hand end then removed; AWAY = auto check/fold, skipped from next deal (dead SB if SB), returning player owes `posts a missing small blind of 10`.
17. New seats require owner ACCEPT; joiner waits `You requested this seat. Wait for the owner approval.`; seated player enters at next hand (`IN NEXT HAND`) and owes no blind on first orbit when UTG.

## REMAINING UNKNOWN (not observed)
- Odd-chip distribution (ties with odd pot), 7-2/bounty, double-board.
- Short all-in that is not a full raise: whether the Raise button is disabled for prior actors (client code says yes via server list cRPI) - could not engineer a short raise shove with available stacks.
- Burn cards (not shown in log or UI), Fast/Slow showdown presentation times beyond default, time-bank drain/refill math (10 hands), stack request/rebuy approval timing (Allow Rebuy off in all tests), owner 'Reject'/'Ignore' behaviour, kicked-player flows, pause/resume effects on timers, equity rounding rule and whether odd-chip run splits favour run 1, exactly which hands are shown to non-all-in players with 'Reveal all hands' off, exact reveal window length of rabbit hunting (about until next hand starts ~8-10 s), straddle behaviour when UTG stack <40 and with straddler pref off but table on (not tested), multiple straddles/re-straddle (none observed).

## BLOCKER (historic - resolved: owner passed captcha)
`/start-game` shows a Cloudflare Turnstile ("Verify you are human" checkbox) and the CREATE GAME button stays "LOADING..."
until it is passed (evidence/rules/02-after.png; same result in desktop-ui/after-create.png from another agent).
Brief says stop on captcha, so no table was created, no multi-context hands were played, and the whole observed test
matrix is NOT EXECUTED. Needed from owner: create a table by hand (play money) and paste the /games/<id> link; guests
joining by link may or may not need Turnstile (untested). A ready harness exists: evidence/rules/harness.mjs
(HTTP-driven puppeteer, one incognito context per named player; POST JS to :7777).

## 1. DOCUMENTED (official blog, fetched 2026-10-25; text in evidence/rules/blog-*.txt)
- Run it twice (Jan 19 2021): enable at Options > Game "Allow Run it Twice?". Applies when betting ends before the river.
  Players in the hand are prompted yes/no. If all prompted say yes, the board is dealt and then a second run is dealt;
  each run's best hand gets half the pot. If prompted after the flop, only turn+river are dealt twice (flop shared).
  Only NLHE and PLO Hi. (Blog is old; newer UI has Always / Ask Players / No - see 2.)
- Rabbit hunting (Feb 11 2021): setting "Allow players to see the undealt cards? (Rabbit Hunting)" Yes/No, saved with
  "Update"; takes effect next hand. All seated players may see undealt streets when the hand ends before the river but only
  those who press "Reveal" see them. Does not affect winners.
- Update Jan 11 2021: "Stop game in the next hand" is a hard stop: on restart the dealer is randomly assigned and missed
  blinds are forgiven (client confirm text: "You are about to stop the game. When restarting the game, the dealer will be
  randomly assigned and the missed blinds will be forgiven."). Anyone connected can view Options > Game; only owner edits.
  Owner can reject seat requests. Away/offline players respect "Deal hands to away players?".
- Owner notes file (official-feature-notes.md) restates the above; Build-Specification.txt is a design proposal (moving
  button, no dead button, odd chip left of dealer, etc.) and is NOT evidence of PokerNow behaviour.

## 2. CLIENT-JS facts (game.bundle-3de25236..., read-only; strings verbatim)
### Table config labels (Options > Game)
- "Use cents values?" Yes/No
- "Allow Run it Twice?" segmented: **Always** | **Ask Players** | **No** (stored rIT = "always"|"ask_players"|"no"; legacy true = ask_players)
- "Allow players to see the undealt cards? (Rabbit Hunting)" Yes/No
- "Allow UTG Straddle 2BB?" Yes/No (so straddle = UTG only, 2 BB, optional per table)
- "Auto trim excess bets? " Yes/No; help: "When enabled, raises that exceed the maximum allowed bet based on the enemies stacks are trimmed down to the highest valid amount."
- "Auto start the next hand?" Yes/No
- "Deal hands to away players?" Yes/No
- "Decision Time Limit (seconds) (blank to no limit)"
- "Time Bank Length (seconds) (blank to no time bank)"
- "Number of played hands to fill time bank"  (time bank refills over N played hands)
- "Reveal all hands when no more action is possible?" Yes/No
- "Showdown Presentation Time": "Fast (3s)" | "Normal (6s)" | "Slow (9s)"
- "Spectator Mode" Yes/No; 7-2 bounty field placeholder "(Bounty)" maxLength 6 (hold'em only, paid by each other participant at hand end)
- "Allow Rebuy? ": "When enabled, busted players can immediately request a rebuy with a new stack value. The game owner must approve or reject each request."
- "Double Board? " Always | Bomb Pot | Off; "Bomb pot? " (default prob 5, default 2 BB), "Probability for Bomb Pots (1% to 100%)", "Bomb Pot Blinds Quantity"
- Double-board help: "Two separate sets of community cards are dealt. Players aim to make the best hand on each board. Only for Texas Hold'em, Pot Limit Omaha Hi and Pot Limit Omaha 5 Hi. Run it Twice is not applied."
- Player preference "Run it Twice?": Yes | No | "Ask each Time" (defaultRunItTwice true/false/null); if boolean it is auto-submitted when the prompt appears.
- Player preference "Auto Straddle 2 Big Blinds when UTG?" with help "The game owner needs to allow straddle at the game configs."
- Player preference "Auto activate your extra time?" Yes/No (client auto-sends time-bank activation if the player has a queued intended action and is on turn and has bank left).
- Showdown/other: owner hint line while waiting: "Waiting for run it twice decisions (Ns)" (countdown from server `until`, refreshed every 80 ms, floor seconds, never below 0).

### Action buttons / hotkeys (derived client logic from server frame fields)
- Buttons: "Check" (hotkey k), "Call <amount>" / "All In <amount>" / "Bet <amount>" quick label (hotkey c), "Raise"/"Bet" opens bet panel (hotkey r; label Raise if a bet exists, else Bet), "Fold" (f), "Check or Fold" (i, pre-action), "Activate Extra Time (<N>s)" / "Extra Time Activated" (t).
- Quick label rule: amount = currentHigherBet - myBet; if 0 => "Bet <bigBlind>"; if amount >= my stack => "All In <stack>"; else "Call <amount>". BB display mode appends "BB".
- Check enabled if highest bet is 0/"check", or I am all-in, or I am in the "BB option" list (wBACPI). Fold always possible unless all-in; fold needs confirmation when check would be free.
- canBet (raise allowed) requires: it is my decision, I am NOT in server list cRPI (players who may not re-raise = the no-reopen set after a short all-in), and stack > highest bet.
- Bet panel bounds: min = server mR (min raise-to), max = min(stack, mAVTB) where mAVTB = max amount allowed to bet given opponents' stacks (effective-stack cap); presets list includes highest bet and all-in.
- Bet label in panel: "Raise" if typed value > valueThatRaises else "Call"; empty => "Bet".
- Leave seat confirm: "Are you sure that you want to leave your seat?" + "You will enter in check/fold mode until the hand's end." (leave mid-hand = auto check/fold until hand ends; actions QNH / CQNH to cancel).
- Seat status badges: "Fold", "Waiting", "Away", "In Next Hand", "Quitting", suffix " (Away)", " (Offline)". Put-on-away by owner: "Are you sure that you want to put this player in away mode?" / alert "The player entered in away mode." Sit option "Sit with Away set".

### Run it twice UI (client)
- Prompt shown only if server flag wRITD set and my gameStatus is inGame or allIn (folded players are not asked): panel class rit-container, label "Run it Twice?", buttons "Yes" (green) / "No" (red); my current choice highlighted (state rITD[playerId]). Message type DRITD {decision:boolean}. Button click debounce interval 190 ms.
- Board renders two rows `table-cards run-1` and `run-2` (cards[1], cards[2]). In run-it-twice the second run row shows after first; first-run row keeps shared cards; padding/low opacity used to dim cards not yet dealt in run 2.
- The "Show hand" button is NOT shown while wRITD pending.
- No equity/percentage code found in the client bundle (grep for equity/percent returned only bomb-pot probability and offline time-bank bar). INFERENCE: the live win-percentage, if it exists, is either absent or not computed client-side. UNKNOWN - needs live observation.

### Rabbit hunting UI (client)
- Board component shows a "Reveal" button (hotkey h; on mobile no hotkey label) in place of the missing cards (width scales with number of missing cards: 4.61rem*n + 0.29rem*(n-1)+0.5rem) when allowRabbitHunting. Message type RUC. Revealed cards render as `rabbitHuntingCard` with semi-hidden (reduced opacity) styling. In double-board the reveal activator belongs to run 2 row.

### Show cards (after hand end)
- Button group "show-hand-buttons": "Show All Cards" (hotkey s) plus one toggle per hole card (rank label, 'T' shown as 10, hotkey per card). Message SHOW_HAND {cardToShow: "all" or card}. Shown to a player who has cards (pC), when game turn is GAME_RESULT, or all-in/in-game with directToNexTurn, status inGame, and no pending run-it-twice decision. A timer `showingShowHandButtonUntil` = sNAA - 600 ms (server next-action-at minus 0.6 s) bounds the window when auto-deal is on.

### Streets constant
Pre-Flop, Flop, Turn, River, Showdown, Game Result.

### Log
- Log modal lists entries with HH:MM (24h, en-US) timestamp and server-formatted text msg; player rendered as `"Name @ id"` with a tooltip "Player ID: id". Empty: "Empty Log"; error: "Something wrong happened when loading the log.". CSS class rules reveal the message grammar: starts with `-- starting` (hand start), `flop:` `turn:` `river:`, `... collected <n> from ...`, `... folds`, `... raises to <n>`, `... bets <n>`, `... big blind of <n>`, `... small blind of <n>`, `... checks`, `... calls <n>`. Full wording for other events (showdown, uncalled bet, straddle, run twice, leave, away, time out) is UNKNOWN until observed.

## 3. TEST MATRIX (NOT EXECUTED - blocked). Run these once a table link exists
| # | Scenario | Setup | Capture |
|---|----------|-------|---------|
|1| 3-handed dealer rotation, blinds | 3 contexts | dealer/SB/BB markers over 4 hands, log lines |
|2| Heads-up blinds & order | 2 players | who posts SB, who acts first pre/post |
|3| New player joins mid-orbit | 4th joins | missed/posted BB behaviour, "In Next Hand", return-on-BB |
|4| Player busts/leaves -> dead button? | 4 players | button location next hand |
|5| UTG straddle | enable setting, pref on | order, min raise, who acts last, log text |
|6| Min-raise chain / re-raise | raise 100 then 150 etc | mR values, panel bounds |
|7| Short all-in not reopening | all-in under min raise | cRPI -> Raise disabled for prior actors |
|8| Side pots 3-way, differing stacks | stacks 100/300/600 | pot display, awards, log |
|9| Odd chip split | tie on pot of odd amount | who gets remainder |
|10| Uncalled bet return | bet > all calls | log wording, timing |
|11| Showdown order / who must show / auto-muck | multi-way | order of reveals, hand names text |
|12| Fold-win show buttons | all fold | "Show All Cards", per-card |
|13| Timer expiry | limit 15s | auto check vs fold, log |
|14| Time bank | bank 30s, refill N | button text, drain, refill |
|15| Away / leave mid-hand | leave seat | check/fold mode, "Quitting" |
|16| Stack request approval | owner approves | when stack applies |
|17| Run it twice Always / Ask / No, with side pots, with a decliner | all-in preflop and on flop | prompt, timer, per-run cards, pot split, odd chip, hand text, equity % |
|18| Rabbit hunting | fold on flop | Reveal button, shown cards, who sees |
|19| Burn cards | any | not visible in client (server dealt) |
