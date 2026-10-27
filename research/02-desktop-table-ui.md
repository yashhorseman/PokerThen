# 02 - Desktop in-game table UI (pokernow.com)

Status: PART A (static analysis of the public CSS/JS bundle) complete. PART B (live measurements) appended at the end when done.
Evidence: research/evidence/desktop-ui/ (static/ = downloaded CDN css/js used; home.png, start-game.png).
Source tags: [CSS] = stylesheet game-09d8e489f29e5f022a84.css; [JS] = game.bundle-3de25236641b161daa4a.js (build 20547581d602); [LIVE] = measured in browser.
Everything is OBSERVATION from those files unless marked INFERENCE. Their images/fonts/audio are NOT copied; PokerThen draws its own.

## 1. Global scaling model (most important fact)
- The whole game is one `#canvas` box, `aspect-ratio: 16/9` (1.954/1 when "expanded"), `overflow:hidden`, shadow `0 0 2rem rgba(0,0,0,.34)`. Width 100% of viewport; if viewport aspect >= 16:9 (`@media (min-aspect-ratio:16/9)`) height is 100% and width auto (letterboxed; `body` is flex, justify space-between).
- JS (ResizeObserver on #canvas): `html.style.fontSize = 0.032 * canvasHeightPx` px. So 1rem = 3.2% of canvas height; canvas = 55.55rem x 31.25rem. It also sets `--table-design-system-zoom = 16 / min(rem_px, 26)`.
  1440x900 viewport: canvas 1440x810, rem = 25.92px. 1920x1080: rem = 34.56px.
- Every size below is in rem, so the layout is a pure uniform scale of a 55.55 x 31.25 rem design. PokerThen: do the same (one root font-size from canvas height; children in rem/%).
- Root class `landscape` or `portrait` on `<html>` (matchMedia orientation; on mobile UA uses screen.orientation). Landscape = desktop layout here. Portrait: `aspect-ratio 1/1.8` (phone topic).
- Fonts: body `Mulish, sans-serif` (200,300,400,700,900); card ranks `"Abril Fatface", cursive`; icons via custom icon fonts "Utils"/"Suits" (PokerThen draws own icons).
- `.game-main-container` background: dark textured jpg, cover. Felt: `.table` background png, cover/center.

## 2. Canvas layout (landscape; all absolute, rem)
| Element | Class | Position / size [CSS] |
|---|---|---|
| Table (felt image) | `.table` | `height 26.25rem; width 55.55rem; margin 0 auto; position relative`. Spans full canvas width; remaining ~5rem at the bottom is occupied by overlays (chat, action bar) |
| Left button column (Options / Away / Leave Seat) | `.top-buttons` | `left .5rem; top 1.5rem; width 2.8rem; z 3`; each `.top-buttons-button` 3rem x 2.8rem, border .05rem #454545, icon 1.5rem + .35rem uppercase label, colour #797979, highlight bg #353535, first/last outer radius .2rem |
| Blinds/game info (top right) | `.game-infos` | `right .8rem; top .25rem; height 2.5rem; flex column; align-items flex-end; z 2` |
| Right button column (sound, not-seated players, pause, stop) | `.top-right-buttons` | `right .8rem; top 2.8rem; width 2.1rem; z 20`; buttons 2.1 x 2.1rem, gap .1rem |
| Full-screen button | `.full-screen-button` | `top 7.25rem; right 3.3rem; 2.1 x 2.1rem; bg #000 opacity .3; radius .3rem` |
| Chat | `.chat` | `left .4rem; bottom .5rem`; `.chat-container` 22.5rem x 4.4rem (expanded 14rem, z 20), bg #2f2f2f, radius .3rem, font .7rem, colour #969696 |
| Log / Ledger button | `.aux-chat-bottom-buttons-ctn` | `left .4rem; top 24.1rem`; `.show-log-button` = `button-1 small-button dark-gray` label "Log / Ledger", hotkey badge "l" |
| Spectator count | `.spectators-count-ctn` | `top 23rem; left .6rem` (eye icon yellow + count) |
| Help/version links | `.help-link-game` top 24.2rem left 5.3rem; `.version-link-in-game` top 25.2rem left 5.3rem |
| Next Hand button | `.next-hand-button` | `top 17rem; left 50%; margin-left -4.5rem; width 9rem; bg rgba(255,255,255,.05); backdrop-filter blur(.1rem)`, hotkey badge "enter" |
| Owner-paused/waiting text | `.room-owner-paused` | `top 16.8rem; .73rem; bold; rgba(255,255,255,.5); centered full width` (`.rh-message`: top 15rem, .5rem) |
| Action bar | `.game-decisions-ctn` | `bottom .5rem; right .7rem; nowrap` |
| Disconnect banner | `.disconnect-warning` | `top 0; width 100%; padding .5rem; bg red; #fff; bold .7rem; z 201` |
| Game type watermark | `.table-game-type` | `top 14rem; width 100%; centered; .85rem bold white; opacity .1`; text = full name e.g. "No Limit Texas Hold'em" |

## 3. Table / felt / rail
- `.table` 55.55 x 26.25rem (ratio 2.116:1). Felt + rail is ONE raster image, cover/centre. Variants: default green; `.red` (applied when `currentFrame.sPM` true - the spectator/"god mode" flag; INFERENCE) swaps to a red image; `.table.glow:before` overlays a glow png, `opacity 0->1`, `transition-duration .5s`. Custom felts (Plus) via inline background-image (out of scope).
- start-game.png (blurred background): green oval felt with lighter rim on a dark grey room. Exact felt colours: sample in part B.

## 4. Seats
Fixed slots 1..10, each `.table-player.table-player-N`, abs, size `18% x 13.5%` of the table box (=10.0rem x 3.54rem); base `top -.2rem; left -1.8rem` is overridden by the slot rules; z 4 (slot 1: 5).
Seat positions do NOT depend on player count: a player sits in the slot of the seat number chosen; empty seats render as dashed boxes (when the viewer can sit). 2..10 players = just fewer/more occupied slots. (Whether the current user is rotated to the bottom: no rotation code seen; formation maps seat number -> position. Verify live.)

| slot | top % | left % | location |
|---|---|---|---|
| 1 | 82 | 53 | bottom, right of centre |
| 2 | 82 | 29 | bottom, left of centre |
| 3 | 66 | 8 | lower left |
| 4 | 40 | 2.5 | left middle |
| 5 | 14 | 8 | upper left |
| 6 | 2 | 29 | top, left of centre |
| 7 | 2 | 53 | top, right of centre |
| 8 | 14 | 74 | upper right |
| 9 | 40 | 80.5 | right middle |
| 10 | 66 | 75 | lower right |

Empty seat `.table-player-seat`: `border 1px dashed rgba(255,255,255,.1); radius .3rem`; seat number top-left (`.table-player-seat-position-number` #4e4c4c, .8rem, weight lighter, top/left .5rem; hover #ccc); centred button text "Sit" (`.table-player-seat-button`: .6rem uppercase letter-spacing .2rem colour #888; selected state border/text #fff). Click opens the seat popover (section 16).

## 5. Player plate (`.table-player-infos-ctn`)
- Fills the seat box: bg `rgba(51,51,51,.76)`, radius .3rem, shadow `0 0 .6em rgba(0,0,0,.25)`, overflow hidden, bold.
- Name `.table-player-name`: abs `left 5.2rem; top .9rem; width 4.5rem; height .9rem; font .7em; colour #c3c3c3; nowrap; overflow hidden`; dotted underline (#575757). Auto-shrink (measured at mount, scrollWidth - offsetWidth): >0 -> `.65em`, >10px -> `.58em`, >30px -> `.42em`. 4/5-card hands: width 4.3rem left 5.3rem. With avatar/video: left 4.2rem top .15rem font .58rem.
- Stack `.table-player-stack`: abs `left 5.2rem; top 1.8rem; width 3.8rem; line-height .8rem; .7rem; #fff`. Shows stack minus current-street bet; `All In` when 0 (and no gain). After a hand result: `<stack before gain> [+gain pill]` pill `.table-player-stack-prize` white on #7b8a50, padding 0 .28rem, radius .15rem (negative: red bg, no plus).
- Left ~5rem of the plate is the hole-card area (cards overhang left by .9rem). (Avatar images only for logged/premium players; guest plates have no avatar.)
- Status text `.table-player-status-icon` [JS]: "Fold", "Waiting", "Away", "In Next Hand", "Quitting"; suffixes " (Away)" and " (Offline)". Folded/standing plates text opacity .6. Offline seat: `filter: grayscale(1)`.
- Turn highlight `.decision-current`: plate bg becomes #fff, name #3c4218, stack #000, plus overlay `::before` with `glow-current .4s forwards` (box-shadow 0 0 0 0 #fff -> 0 0 2.1em 0 #fff).
- Winner `.winner`: plate bg #fff; shadow `0 0 .6em rgba(0,0,0,.25), inset 0 0 2.6em rgba(223,245,43,.48)`; glow chain on `::before`: `glow-grow 1s` (0 -> 3em #e9ff63), `glow-decrease 1s` delay 1s (3em -> 2em), `glow-pulse 2s` delay 2s (2em -> 3em @50% -> 2em); forwards.
- "You" plate text colour #5e5bc3. Signal pills (win count #49a16e, re-buy/leave count #ab4343, notes, mic) 1.1rem tall, .5rem bold white.
- Emoji mood (google emoji set 1.82rem) at plate top-right (`.emoji-container` right -.8rem top 1.5rem); chat bubble `.table-player-chat-message` blue (#546eca) with tail.

## 6. Dealer button
- `.dealer-button-ctn` abs, z 5, `transition-duration .5s` (slides between slot positions, ease). Image 1.9 x 1.6rem; `.dead-button` opacity .5. Position (top rem, left rem) by slot: 1: 19.7/28.5; 2: 19.4/19.7; 3: 18.1/15.7; 4: 13.6/11.0; 5: 7.7/12.3; 6: 4.5/25.2; 7: 4.5/28.5; 8: 8.5/40.7; 9: 14.4/42.7; 10: 18.1/37.9 [CSS]. Live straddle button shares the ctn with class `second` offset when on the dealer's seat.
- There are NO separate SB / BB marker buttons in the DOM: blinds show only as bet pills and log lines.

## 7. Bets / pot
- No chip graphics. Current-street bet = pill `.table-player-bet-value` (z 52): .8rem bold, bg #eaffba, shadow `0 0 .3em #286543, inset 0 0 1.5em #e4fd14`, radius 5vh, colour #000, padding `4% 7%`. Check = white pill (`.check`, inset #f5f5f5) text "check" (not shown for folded). Number formats: integer, cents (2 decimals), or "<n>BB".
- Pill position relative to seat box: 1 top -78% left 9%; 2 top -78% left 55%; 3 top -30% left 103%; 4 top 21% left 107%; 5 top 82% left 102%; 6 top 130% left 45%; 7 top 130% left 18%; 8 right 103% top 82%; 9 right 110% top 22%; 10 right 105% top -32%.
- Pot `.table-pot-size`: abs `top 24%; left 43.4%; width 13%; height 1.9rem`; `.main-value` centred white bold 1.1em, line-height 1.9rem, no background. If displayed pot != fullPot a pill `.add-on` (top -.32rem, right aligned, bg #00000040, white .65rem, radius 2rem, blur 1rem) shows `total <fullPot>` (small "total" .35rem #ffffffa3), fading .5s. No separate side-pot widgets (verify live).
- Bomb pot: yellow pill "Bomb Pot".
- No movement animation of chips/pot (see 17).

## 8. Cards
Sizes [CSS] (w x h rem): hole `med` 3.05 x 3.7 (font 1.3rem); 4 cards `small` 3 x 3.63; 5 cards `small-2` 2.7075 x 3.276; community `big` 4.5 x 5.5 (font 2rem). Radius 7%. Shadows: general `0 .2rem .2rem rgba(0,0,0,.19)`; board `0 0 .5rem rgba(0,0,0,.25)`; hole `0 0 .8rem rgba(0,0,0,.4)`.
Face: white; rank text (T shown "10") Abril Fatface at `top 7%; left 18%; height 21%`; suit glyph (icon font) 1.9rem (board) / 1.28rem (hole) at `top 53%; left 38%`. `sub-suit` mode (4/5-card hands, phone, video): rank .8em left 4% top -.1rem; small suit .55em left 6% top 33%; big suit top 48%.
Colours: two-colour deck default (h,d #db3131; s,c #2c2c2c); four-colour (h #db3131, d #4747ea, s #000, c #17b717) by player pref `deckStyle`. Card back: patterned svg cover.
Hole fan in seat: `.table-player-cards` abs `left -.9rem; top -.1rem; z 3`; card1 `rotate(-7deg) left .3rem`; card2 `rotate(7deg) left 2.65rem`. 4 cards: rotations -28/-8/11/31deg, left 0/.85/1.7/2.55rem, outer cards top .3rem; 5 cards: -32/-16/... (see CSS 9782+).
Own hole cards face up; others' backs. Winning cards raised: class `up` -> `top -.2rem` (hole) / `-.5rem` (board), `transition-duration .5s`; non-winning dim `filter brightness(35%)`. Folded: cards fade (`hide-cards`: opacity 0, top .2rem, .5s). `sneak` = faint back overlay (opacity .4) over a face you can see but others cannot.
Hand label `.player-hand-message-ctn` (z 50; top 3.3rem; left -.8rem; min-width 5.9rem; max 7rem): red #f75757 uppercase .5rem white text, radius .2rem; two-run labels with "#1" #6d64e0 active / "#2" #d82525; also "Away", "Offline", "Offline & Away".
Board `.table-cards`: abs `top 35%; left 28%; width 24.2rem; flex; z 2`; cards `margin-right .4rem` (5x4.5+4x.4=24.1rem). Second board (run-2): `top 43%; left 29%` (shadow offset up).
Flip: `.card-flipper-animated` only if `window.chrome`: `transition .15s` (ease) rotateY 0 -> 180deg, perspective 1000px, backface hidden. Else instant.
Board reveal sequencing [JS]: on card count growth `flipCards` polls every 50ms and flips the next unflipped card, min spacing 150ms between flips; each flip plays `card-place` (if sound). No hole-card deal animation.
Rabbit hunt: button "Reveal" + hotkey badge "h" over undealt slots, width `4.61*n + 0.29*(n-1) + .5` rem.

## 9. Action bar [CSS+JS]
Container opacity .3 (`low`, hover 1) when not your turn.
Buttons `.button-1.action-button`: height 3.5rem, padding 0 1.2rem, font .8rem, gap .5rem, order left to right: Call / Bet label, Raise/Bet, Check, Fold; `.raise` width 6rem. `.button-1`: transparent, border .08rem (bottom .15rem), radius .3rem, bold uppercase; green #39af6b (highlighted bg #3fa76c, bottom #348959), red #fc4117 (highlighted #c15942), gray (#b9b9b9; highlighted #7b7b7b), yellow #ffea00, blue #7f7df5, dark-gray; disabled opacity .25. Hotkey badge `:before` top -.28rem right .5rem bg #232122 white .5rem bold.
Hotkeys: Call `c`, Raise/Bet `r`, Check `k`, Fold `f`, Check or Fold `i`, Extra time `t`, bet screen back `esc`, Next Hand `enter`, Show all cards `s` (cards `1`,`2`..), Log `l`, Pause `p`, New chat message `m`, toggle BB display `b`, Reveal rabbit cards `h`, (css badge `y` call-any exists but unused in JS), `+` add blind level (config screen). Shortcuts disabled while a modal/input has focus.
Labels [JS]: call button "Call <amt>" (amt = highest bet - your bet); amt=0 -> "Bet <bigBlind>"; amt >= stack -> "All In <stack>"; BB mode appends "BB". Raise button "Raise" if a bet exists else "Bet". Check/Fold buttons always rendered; disabled when not allowed.
Rules: canCheck = no bet or you have the BB option or all-in. Call shown if highest bet != your bet and not all-in. Raise enabled on your turn if not in "can't raise" list and stack > highest bet.
Pre-actions: when not your turn the same buttons toggle a queued action (highlighted): Check, Fold, Call, plus extra "Check or Fold" (`.suspended-action`: right 0, bottom 4.1rem, height 2.2rem; shown when you are not to act and could check or nothing to call). Queued call/check auto-clears if the bet changes; CHECK_OR_FOLD turns into Fold if someone bets. On your turn, after any click all buttons disable for 750ms.
Fold confirm (when fold unnecessary): "Are you sure that you want do an unnecessary fold?" + small "Do not show this again in this session? [checkbox]" (typo verbatim).
"Your Turn" signal: yellow #ff0 uppercase bold .7rem text above buttons (top -1.2rem right 1rem), with a yellow dot (.85rem, glow #ebff78) blinking: `blinker .2s` x5 after 2s delay, then `blinker 1.5s infinite` after 3s. `beep` plays when your turn starts.
Extra time: button "Activate Extra Time (<n>s)" / "Extra Time Activated" (hotkey t, above bar, `.time-bank` bottom 4.1rem or 5.1rem on bet screen).
Bet screen (Raise/Bet click; Esc/Back return): form 40rem x 4.7rem z 25.
- Left panel `.raise-bet-value` 9em: label "Your bet" (+ " (BB)"), centred input 1.8em bold white on rgba(255,255,255,.04), border .05rem rgba(255,255,255,.1), yellow converted value (e.g. "12.5BB") top-right .5rem #fff083; invalid -> panel bg #d02323. Input focused/selected on open (desktop).
- Middle `.raise-controller` 20em x 4.7rem bg #2f2f2f radius .5em: five presets (19% wide, 2rem tall, .5rem font, spacing .05rem, border .05rem #4f4f4f): "Min Raise", "1/2 Pot", "3/4 Pot", "Pot", "All In" (All In absent for Omaha). Below: slider row (bg #3a3a3a, 2.3rem): "-" button 2rem, range (15rem, track #585858 .3rem, thumb 1rem round #ffbb1f), "+" button; step = big blind, max = max allowed.
- Right: green submit button "Raise" (value > highest bet) / "Call" (== ) / "Bet" (no bet), and gray "Back" (badge esc). Enter submits.
- Preset values: Min Raise = min(minRaise, stack); P = pot + all street bets on table (your bet replaced by the highest bet); 1/2 Pot = H + P/2; 3/4 Pot = H + 3P/4; Pot = H + P (H = highest bet, 0 if none); all capped to stack.
- Valid if value in precise list (H if any; stack if stack <= (H||BB); else H||BB; plus stack if minRaise >= stack) or minRaise <= v <= maxAllowed (min(stack, max effective bet vs opponents)). Initial value: minRaise (or stack if short, or BB when opening).
- Confirming a value > H sends raise-to value; else call.

## 10. Side buttons and menus
- Left column: "Options"; "Away" (stand-up icon) <-> "I'm Back" (sit-back icon); "Leave Seat" (when seated). Away/Leave presses throttled (300/200ms). Leave confirm (unless already armed): "Are you sure that you want to leave your seat?" / "You will enter in check/fold mode until the hand's end."; armed button highlighted, click again cancels. Error when sitting back with no chips: "You can't sit back without chips. Please add chips or request the game host to add chips for you."
- Options popover (`left 115%` of column, padding .7rem): account row (avatar/username or "Guest", "Logout"/"Sign In"), gray buttons "Home", "Game Configurations", "Schedule next game" (or "Next game: <date>"), "Players", "Preferences", "Video/Audio", "Save Current Hand". Notices: "Seasonal table theme is on / You can turn it off here or anytime in Preferences." [Turn off][Keep it] (15s bar); "Changed your mind? / You can schedule the next game anytime from Options." [Got it].
- Right column: sound (cycles off/low/med/high = vol 0/.15/.45/1), not-seated players (eye), pause (owner, key p, texts "Pause the Game"/"Toggle Pause"; banner "The room owner paused the game."), stop (owner; confirm "You are about to stop the game. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven." button "Stop Game on Next Hand").
- Info top-right: optional "Owner: <name>" (.5rem uppercase #777); `<TYPE> ~ <SB> / <BB>` (bold uppercase #9b9b9b .9rem; TYPE = NLH/PLO HI/PLO8/PLO5/PLO5 HL, only when cycling/some modes; "~" small) + " (A: ante)"; icons with popovers (Seven Deuce Bounty, Double Board, Bomb Pot, Simulated Fee); blind timer "Next Blind: sb/bb (A: x) in mm:ss" (#e44444 .55rem uppercase).
- Player plate click menu `.player-controls-popover`: "Report Avatar", "Hide Avatar"/"Show Avatar", "Report Player", "Define Avatar", "Add Chips to Stack", "Mute Chat"/"Unmute Chat", "Edit Player"(owner), gestures, note colours.
- Add chips: "How much do you want to add to your stack? It will be added when the next hand starts." Result texts "The stack add-on was requested successfully, it will be applied when the next hand starts." / "The stack add-on was successfully applied on your stack."
- Remove player: "Are you sure that you want to remove this player from their seat?" [Remove Player]; "Put on Away Mode" ("Are you sure that you want to put this player in away mode?"); "Transfer Game Ownership" ("Are you sure that you want transfer the game ownership?" / "Game ownership successfully transferred.").

## 11. Chat
- Box 22.5 x 4.4rem dark; messages list scroll; right button "New Message" (2.5rem wide, #383838, bubble icon, badge `m`); expand toggle (top edge 1.5 x 1rem at right 3.1rem) -> height 14rem.
- Message: balloon #292929 text #dcdcdc .6rem, time "HH:MM" 24h (#7d7c7c) inline after text; author tab 3.7rem wide `#353535` to the left; foreign message highlight 800ms + chat-beep.
- Blank: "It's a bit quiet here." + "Click on the balloon and send a Message!"; unread: red "New Messages" tab.
- Compose popover (white, 20rem, input 1.8rem, above button): placeholder "Your Message (press Enter to submit)"; Enter sends+closes; Esc/outside closes; error "Something wrong happened. Please try again."
- Hover moderation "Report" / "Mute" (red). Muted list "No players muted" + "Unmute". Recording dot tooltip: "This table chat is being recorded: messages are saved with each hand and may appear in Hand Replayer and shared replays."
- System lines: "⚠️ Profanity is not allowed. Next offense in the next 10 minutes will result in a 10-minutes block." / "⚠️ You have been blocked from the chat for 10 minutes due to profanity." / "... 24 hours due to profanity." / "Table notification: poker variant rotation stopped due the blind level."

## 12. Log / Ledger modal
Button "Log / Ledger" (key `l`; long-press opens ledger). Modal `.log-modal`: title "Session Log" | "Session Ledger" | "Game Replayer" | "Cash-in/Cash-Out Log"; "Close" button; bottom tabs "Full Log", "Ledger", "Replayer". Log entry = `HH:MM` + text; pager "« Hand #n" / "Hand #n »"; "Download" (captcha text "In order to download, please solve the captcha. Important: the log file is limited to 20,000 lines."); states "Loading...", "Empty Log". Errors: "Too many requests, please try again in some seconds.", "The log access is limited due the high load on servers. Please try again in some minutes.", "Something wrong happened when loading the log.", "Sorry, the ledger is not available in this type of game." Entry CSS classes by regex: `-- starting` start-game; `flop:|turn:|river:` street; ` collected N from` collect; `folds$` fold; `raises to|bets|big blind of|small blind of N` raise; ` checks$` check; ` calls N` call. Names `"name @ id"` rendered as name with title "Player ID: id". No always-visible log panel.

## 13. Sounds (names only)
two-taps = check (also BB option check); chips = any bet change (bet/call/raise/blind); fold = player folds; winner = you win; card-place = each board card flip; beep = your turn; warning-beep = 70% of your normal time (and again of time bank); chat-beep = foreign chat message; new-player-beep = Options notification count rises; lost = loaded, unused; dumb-sound = silent unlock at load. First 4 (two-taps/chips/fold/winner? and card) are "secondary" except beep/chat/new-player: pref "Disable Secondary Sound Effects? (Fold/Check/Bet/Card)". Volume steps 0/.15/.45/1. Sounds play only after the silent unlock played.

## 14. Turn timer (bar, no ring)
`.time-to-talk` at the bottom edge of the plate: `height .2rem; width 54.5%; right 0; bottom 0; bg #efefef; flex`. Segments: time-bank purple #9972cb (left) and normal-time green #b1d85d; widths recomputed every 100ms from server-synced clock: normal = shareNormal*(100-consumed%), bank likewise; each segment turns red when >70% consumed (with warning-beep). Offline time bank drawn as green. 4/5-card hands: width 63%.

## 15. Table banners (`.table-warning-ctn`): abs, `left 50%; margin-left -15rem; width 30rem; top 37%; min-height 4rem; bg #fff; radius 3rem; shadow 0 0 3rem rgba(146,146,146,.31); z 2`; text .7rem centred pre-line
- "Waiting for others" (clock icon title) with two options split by an "OR" disc: "Share this link with **your friends!**" [Copy Link -> "Copied!" 2s]; "Play with **Poker Now community**" [Join a Live Game] (or "Play again **next week?**" [Schedule next game] / "Next game: ..." [Invite your group]).
- "First deal in mm:ss"; "This table is waiting for new players. Please wait a moment."; "The tournament is on break / It will resume at ..."; "Heads Up Finished" (1st/2nd rows, "click here for more info"); "This tournament will start at ...".
- Free text under pot: "Waiting for the owner to deal the next hand."; "The room owner paused the game."; "Waiting for busted players to make rebuy decision. (n seconds)"; "Waiting for the owner to approve/deny the pending rebuys. (n seconds)"; "Some players are seeing the undealt cards."; "Waiting for run it twice decisions (ns)"; "Waiting for Nit Game <interest|confirmation> decisions (ns)"; "Spectator Mode Activated [?]".
- Buttons: "Next Hand »" (owner when auto-deal off). "Show All Cards" (+ per-card toggles) after folding/showdown. Rebuy popup "Would you like to Rebuy?" ("Available values:").
- Seat request toast: "You requested this seat. Wait for the owner approval."; "An error occurred when requesting the seat."

## 16. Seat popover (join)
Fields: "Your Nickname", "Your Stack" (owner) / "Intended Stack", checkbox "Allow unseated players to see my hole cards" (only when spectator agreement shown), checkbox "Sit with Away set"; submit "Take the Seat" (owner) / "Request the Seat" / "Requesting…". Owner popover for pending players: "Requested Ingress with", "Playing with", "Waiting next turn to enter", "Allowed to be Spectator", approve/reject, "Player successfully approved.", "Ingress request successfully rejected.", "Whoops, something goes wrong.".

## 17. Animation inventory (complete CSS list)
| What | Spec |
|---|---|
| Your-turn plate glow | glow-current .4s forwards |
| Winner glow | glow-grow 1s; glow-decrease 1s delay 1s; glow-pulse 2s delay 2s |
| Winning cards raise | `.5s` (transition-duration, default ease) |
| Hole cards fade/hide | `.5s`; own dim `.3s` |
| Board card flip | `.15s` rotateY (Chrome), 150ms stagger |
| Dealer button move | `.5s` all |
| Pot total pill, table glow | `.5s` opacity |
| Your-Turn dot | blinker .2s x5 @2s; 1.5s infinite @3s |
| Banners (bomb/7-2) | `.8s linear` opacity/visibility |
| Nit penalty banner | 620ms cubic-bezier(.22,.61,.26,1) |
| Avatar winner scale | 1.13, `.5s ease-in-out` (premium avatar only) |
Absent: card-dealing flight, chip flight to pot, pot-to-winner movement, showdown flip of opponents' hole cards (they appear via opacity/state change), no timer ring. Frame pacing (delays between street reveals, showdown) is server-driven (setting "Showdown Presentation Time"); measure live.

## PART B - live measurements (host tab read-only + incognito spectator contexts; lock held 21:39-21:46, released)
Evidence: evidence/desktop-ui/live-host-now.png, spectator-1440x900.png, spectator-1024x768.png, spectator-768x1024.png, anim-award-montage.jpg, anim-turn-glow-montage.jpg, frames/ (shots.json = screenshot timestamps ~81ms apart, events.json/events2.json = DOM mutation logs with ms timestamps).

### B1. Scaling confirmed by measurement
| viewport | html font-size | canvas (x,y,w,h) | table w x h | class |
|---|---|---|---|---|
| 1300x813 (host window) | 23.4px | 0,40.9,1300x731.25 | 1299.9 x 614.25 | landscape |
| 1440x900 | 25.92px | 0,45,1440x810 | 1439.9 x 680.4 | landscape |
| 1024x768 | 18.432px | 0,96,1024x576 (letterboxed vertically, centred) | 1023.9 x 483.8 | landscape |
| 768x1024 | 32.768px | 99.6,0,568.9x1024 (letterboxed horizontally) | 570.2 x 917.5 | portrait |
All derived values match the CSS-derived rem numbers exactly: seat plate 18% x 13.5% (233.97 x 82.92px at rem 23.4 = 10.0 x 3.54rem); seat 1 left 689px = 53% of 1300; name font 16.38px = .7rem; stack font 16.38px; bet pill font 18.72px = .8rem, pill box 55.2 x 42.2px, padding 9.35/16.4px, radius 40.65px (=5vh of 813); dealer button 44.45 x 37.44px = 1.9 x 1.6rem; pot box 169 x 44.5px (=13% / 1.9rem); board row width 566.3px = 24.2rem; hole card (before rotation) 3.05 x 3.7rem (bbox with +-7deg rotation 81.4 x 94.6px); hole rank font 30.42px = 1.3rem; time bar 127.5 x 4.7px = 54.5% x .2rem; chat box 526.5 x 103px = 22.5 x 4.4rem; left buttons 70.2 x 65.5px = 3 x 2.8rem; top-right buttons 49.1px = 2.1rem; game-infos box 136 x 58.5px.
Seat numbering is NOT rotated per viewer: a spectator sees "yash" in seat 1, Bob 2, Carol 3, Dave 4, and seats 5..10 as dashed boxes with the seat number top-left and the word "SIT" (spectators/unseated viewers see all empty seats). The host (seated, in slot 1) also sees himself in slot 1 and empty seats 5-10 are hidden for seated players (host DOM listed only occupied seats). INFERENCE: empty-seat boxes are only drawn for viewers who can sit (not seated).

### B2. Visual corrections vs section 1-8 (static)
- The host table used a SEASONAL theme (Halloween felt `hw26-felt-l.png`, purple felt, pumpkin/candle/spider decorations, orange-rimmed card backs). Default theme is the green felt png from the CSS; the option "Show Seasonal Table Theme?" exists in Preferences. PokerThen must build a theme-able felt; default = dark room (#222-ish) + green felt oval with dark rail.
- Room background is near-black grey (#232323..#2a2a2a) textured; the area above/below a letterboxed canvas is #1f1f1f-ish.
- Straddle/dealer markers ARE discs: dealer = white disc with blue "D"; live straddle = white disc with red "S" (this is the `live-straddle` marker; there is still no SB/BB marker). Disc size 44.5 x 37.4px at rem 23.4 (1.9 x 1.6rem). Positions match CSS table (e.g. dealer-position-1 top 460.98px = 19.7rem, left 666.9px = 28.5rem).
- Bet pills are lime/yellow-green (bg rgb(234,255,186) with strong inset glow rgb(228,253,20)), bold black numbers, no chip art; they stay while the street is in progress and all vanish at the same instant when the hand is awarded.
- Folded player plate (seen from spectator): a large grey X icon at the left of the plate with caption "FOLD" under it; plate stays dim; stack/name stay visible. Offline/quitting player plate: exit-arrow icon with caption "QUITTING". (The plate-left 5rem hole-card area is used for these status icons.)
- Hole cards of other players: backs shown overlapping (orange-rim seasonal back; default is the svg back) rotated -7/+7deg. Your own folded cards stay visible but dimmed (grey, brightness 35%) in your seat.
- Trophy/win count green pill and red re-entry pill sit at the plate's top-right corner (e.g. green "4", red "2").
- Pot display: big centred "0" while bets are on the felt, and a small "total 70" pill at the top-right of the pot box (matches add-on pill). The pot value 0 with chips in front of players is normal; after award the pot shows 0 and "total" pill disappears.
- Emoji/mood reaction at plate right bottom; a "Carol is taking too long? maybe send a reaction" thought-bubble popover with 4 emoji (1 NC each) and "don't show it again" appears next to your plate (promo/gesture suggestion, out of scope).
- Info top-right reads: "OWNER: YASH" (small caps) then "NLH ~ 10 / 20" (type shown, `~` small). Left column buttons: OPTIONS, LEAVE SEAT, AWAY (all uppercase small labels). Right column: sound (med), pause (badge "P"), stop. Below chat: `LOG / LEDGER` button with tiny badge "L", and beside it a promo text line ("Polymarket & Poker Now / Join our Squad") - promotional, skip.
- Chat box: two system messages from sender "Poker Now" (promo); blank state text "It's a bit quiet here. Click on the balloon and send a Message!" confirmed live (spectator view). Beside it a "JOIN" mini-panel with camera/mic icons (video/voice; skip).
- Hand-review notification after each hand: green card "REVIEW HAND #22" with "SAVE HAND" (blue, Plus) button, "Do not show it again" checkbox, red "CLOSE" - appears bottom-left ~1.5-3s after the next hand starts.
- After a hand ends with a rabbit-hunt-enabled table: five ghost board cards (class `card-container big sub-suit hide semi-hide`, card backs, dimmed, in the normal board row) and a dark horizontal bar over them labelled "REVEAL" (eye icon) with hotkey badge "H" at right.

### B3. Timings measured (DOM mutation logs + screenshots, host is a 20s limit / 1s bank table)
- Turn start: `decision-current` + `time-to-talk` added; the plate glows white over ~0.4s (3-4 frames of growth at ~100ms; matches `glow-current .4s`). Timer bar re-rendered every ~100ms (events 99-101ms apart). Initial segment widths: time-bank 4.76% / normal 95.2% => normal limit 20s + bank 1s (21s total). At 20.0s the bank segment starts shrinking (bank class events begin at +20.0s) and auto-fold fires at +21.0s (observed 21.04s, 20.97s, 21.01s, 21.04s). "Fold" status text appears the same frame.
- Gap between an action and the next player's `decision-current`: 802ms, 830ms, 888ms, 893ms (~0.8-0.9s; server paced).
- Fold effect: cards removed from DOM and `table-player-cards hide-cards` class set in the same tick as the fold; status text "FOLD" added; (visual fade .5s from CSS).
- Win by everyone folding: from the last fold to award = 788-798ms; at award instant (single tick): pot text -> "0" (total pill disappears), all bet pills removed, "+50" `table-player-stack-prize` pill added to the winner's stack, winner plate gets class `winner`, ghost board cards + REVEAL bar appear (rabbit hunting). Winner glow plays (glow-grow 1s, decrease 1s, pulse 2s => 4s of CSS; screenshots show the plate pale-yellow/white with +50 pill through the whole 3.0s). Next hand starts 3004-3005ms after the award (hole cards dealt, bets 10/20/40 posted in one tick, all 5 hole cards added simultaneously (no stagger), dealer/straddle discs move (0.5s slide), first decision-current set ~simultaneously). NO chip-to-pot or pot-to-winner animation exists: confirmed (bets disappear in one frame; stack number jumps and the +gain pill appears).
- Winner `+gain` pill stays until the next hand deals.
- Board cards: not captured (no flop reached in the recorded hands; every hand ended pre-flop by fold). Showdown, flop flip frames, run-it-twice board (second board at top 43%), side-pot rendering and equity pills (`prob1` percentage chips) remain UNOBSERVED live.
- Chat bubble above player duration: not observed (nobody chatted).

### B4. Action bar live
When it is your turn the bar shows (screenshot): yellow "YOUR TURN" text with dot above the buttons, `ACTIVATE EXTRA TIME (1S)` button with badge `T` right above them; after the auto-activation preference it becomes `EXTRA TIME ACTIVATED` (pref "Auto activate your extra time?"). The host here auto-activates time bank (so the bank is consumed whenever the host's turn arrives - do not leave the host tab on turn).

## UNKNOWN / needs owner help (remaining)
- Live flop/turn/river flip frames, showdown reveal sequence, run-it-twice second board, side-pot pill, equity pills, rabbit-hunt reveal click result, hand-review popover timing: need a hand played to showdown with 2+ active players (needs controlled players at the table).
- Chat bubble duration over a plate; emoji reaction duration.
- Exact default (non-seasonal) felt/rail colours: sample from the default `table-*.png` (turn off the seasonal theme in Preferences) - not done.
- Layout at 3, 6, 9, 10 occupied seats: positions are slot-based and proven identical at 4 seats + 1 quitting; the other counts follow from the slot table (no rotation), not visually verified.
- Audio files not copied (names only).
