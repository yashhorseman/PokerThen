# 04 - Settings, roles, ledger, log, replayer (private Hold'em table)

Sources: (A) LIVE = observed on the live host tab (CDP 9333, 1300x813 viewport, 2026-10-25); (B) BUNDLE = read from the public client
`game.bundle-3de25236641b161daa4a.js` + `game-09d8e489f29e5f022a84.css` + `handReplayer.bundle-22d89a8bce7ff580abb7.js` (logic read as prose, no code copied);
(C) BLOG = pokernow.com/blog posts. Evidence files in `research/evidence/settings/` (see end). Anything not seen is under UNKNOWN. Server-side validation texts and
timing rules are not in the client and are marked UNKNOWN.

Wording note: UI text is rendered UPPERCASE by CSS (`text-transform: uppercase`) on buttons/tabs/segmented controls; the DOM text is as quoted below (labels in sentence case).

## 1. Roles

| Role | How determined | Differences |
|---|---|---|
| Owner/host | `gameState.isOwner`. Creator of the table. Ownership can be transferred (see 4.3). Header at top-right of table shows `OWNER: YASH` (LIVE) | Sees "Players" menu + tab, can edit Game settings, approve/deny seats, Pause, Stop, Next Hand, Start Game, Shuffle Seats, edit/remove players, put away, transfer owner, toggle spectator. A red numeric badge on OPTIONS (and in the Options popover next to "Players") = count of pending seat requests (`notificationsCount`). |
| Seated player | status `inGame` / `standingUp` | Away / I'm Back, Leave Seat, own preferences. Can open Game Configurations read-only. |
| Guest / watcher | status `watching`, name shows `Guest` until named | Can request a seat. Chat allowed unless owner disabled guests ("Every player that has been in the table is considered as guest" per help text). |
| Spectator ("god mode") | owner grants per player when Spectator Mode = Yes | Sees seated players' hole cards while unseated (see 3.13). |

Non-owner behaviour of settings (BUNDLE): Game screen shows banner "Warning: only the room owner can change these settings." All inputs disabled (state `loading` = true), no submit bar. Since Jan 2021 "any connected players in a room will be able to see the game configurations by clicking on Options > Game; only the owner can change them" (BLOG update-january-11-2021). Players tab and Update button are owner only. The "Players" top tab only renders when `showAdminMenus` (owner).

## 2. Options menu (top-left OPTIONS button)

LIVE: button `.top-buttons-button.options`, label "OPTIONS" under a hamburger icon, at x12 y76, 70x66 px (1300 wide). Top-left stack also contains (when applicable) the Leave Seat button and the Away / I'm Back button (BUNDLE order: Options, Leave Seat, Away).
Popover `.popover-1.top-controls-options-popover` (LIVE, buttons 211x33 at x103, y step 36, starting y152):

1. Account row: name (`Guest` if not signed in; else username link "Your Profile" fallback) + button `Sign In` (green, 50x22) / `Logout` (red) when signed in. (Sign-in modal title "Sign in Required", description "You need to sign in before accessing your account options.")
2. `Home` (gray) -> navigates to /home
3. `Game Configurations` -> opens Game screen (all roles)
4. `Schedule next game` (or `Next game: <date>` once scheduled) - only when the game is eligible for a "next game offer" (owner, 4fun mode, hand number > 0; not shown in LIVE snapshot) see 8
5. `Players` (owner only; bubble with pending-request count)
6. `Preferences`
7. `Video/Audio` (out of scope)
8. `Save Current Hand` (Plus-gated: free users get premium modal)
Note: a first-run notice popover "Seasonal table theme is on / You can turn it off here or anytime in Preferences." with buttons `Turn off` / `Keep it` auto-closes after 15 s (15000 ms, ticks of 100 ms, pauses on hover) and another "Changed your mind? You can schedule the next game anytime from Options." with `Got it`.

Config screen top tab bar (LIVE measurements, 1300 px wide): tabs `« BACK`, `PLAYERS` (owner only), `GAME`, `PREFERENCES`, `VIDEO/AUDIO`. Tab: Mulish 23.4px/700, white, uppercase, radius 7.02px top corners, height 80, y53. Active tab bg rgb(144,151,102) (olive) with a 12px-ish olive rule under the whole bar. `« Back` returns to the table.

## 3. Game settings screen ("GAME" tab) - complete inventory

Layout (LIVE/BUNDLE): two columns. Left (`col-2`): Blind Levels block. Right (`col-4`): all other settings in this exact order. A fixed bottom bar holds `CUSTOM PRESETS` (gray, landscape only, 260x75 at x21) and the green submit (220x75 at right). Submit label: `Update Game` if table status is "waiting" (no hand running) else `Update on Next Hand`. Banner "These settings are waiting the next hand to be defined." when a queued change exists. Controls are Yes/No segmented buttons (`.choose-buttons`: 1.5px solid #979797 border, radius 7.02px, buttons 18.72px uppercase, inactive text #666, active bg #383838 text white, height 44-47). Number inputs: text inputs with `inputMode=numeric`, digits only (non-digits stripped; in cents mode a decimal-aware input), border 1.5px #979797 radius 7.02, text 19.89px, height 49. Help "?" = yellow-on-black 15x24 chip (`.help-signal`), either a hover/click popover or a link to a blog post.

Effect timing (all): submit POSTs the whole config object to `/games/{id}/update_game`. If status is waiting -> alert "Game successfully updated." immediately; else alert "New configs successfully enqueued. The game will be updated on the next hand." (applied at start of next hand). Failure: 422 -> alert "Something doesn't look right with your game configurations, please check the errors on the form." with per-field errors (text from server, UNKNOWN). Loading state of screen: "Loading, please wait..." Failure fetching: "Something wrong happened when fetching the game configs." Hand log prints a "Game Config Changes" block (see 7.2).

Defaults below = values on a fresh table inferred from LIVE (the table log "Game Config Changes" only listed the five fields marked (changed) as altered, so the rest are untouched defaults).

| # | Label (verbatim) | Help | Type / options | Default | Who | Notes |
|---|---|---|---|---|---|---|
| 1 | `Blind Levels` | - | table | 1 level: SB 10, BB 20, Duration `∞` (disabled) | owner | see 3.1 |
| 2 | `Antes?` | - | Yes / No | No | owner | adds an `Ante` column |
| 3 | `Theme Design` | - | 3 preview images (phone felt, desktop felt, card back) + buttons `Define a Theme`, `Restore Default Theme`; ribbon `+ Plus` | seasonal default theme (LIVE: purple Halloween felt) | owner, Plus-gated | Original artwork only for PokerThen |
| 4 | `Poker Variant` | - | select | `No Limit Texas Hold'em` (value `th`) | owner | other options are non-Hold'em (out of scope); `Define Variant Rotation` Plus (or 50 NOW coins) |
| 5 | `Use cents values?` | - | Yes/No | No | locked (disabled) once game exists | for club/ tournament games locked |
| 6 | `Allow players to see the undealt cards? (Rabbit Hunting)` | `?` links to blog | Yes/No | No (changed to Yes in LIVE) | owner | takes effect next hand (BLOG): "On the next hand, the option to see the undealt cards will be presented." |
| 7 | `Allow Run it Twice?` | `?` links to blog | `Always` / `Ask Players` / `No` | No | owner | log: `Allow Run it Twice: no » ask players` |
| 8 | `Allow UTG Straddle 2BB?` | - | Yes/No | No | owner | |
| 9 | `Auto start the next hand?` | - | Yes/No | Yes | owner | No => owner gets `Next Hand »` button (Enter key) |
| 10 | `Showdown Presentation Time` | - | `Fast (3s)` / `Normal (6s)` / `Slow (9s)` | Normal (6s) | owner | |
| 11 | `Deal hands to away players?` | - | Yes/No | No | owner | |
| 12 | `Decision Time Limit (seconds) (blank to no limit)` | - | integer | 20 | owner | clearing it (0/blank) also clears time bank & refill fields |
| 13 | `Time Bank Length (seconds) (blank to no time bank)` | - | integer | 10 | owner | disabled when no decision limit |
| 14 | `Number of played hands to fill time bank` | - | integer | 10 | owner | disabled when no time bank |
| 15 | `Reveal all hands when no more action is possible?` | - | Yes/No | Yes | owner | |
| 16 | `Spectator Mode` | `?` opens video modal | Yes/No | No | owner | choosing Yes -> alert "You will need to grant spectator mode to individual players, which you can do in their Edit screen in the Players menu above."; choosing No while game running and it was on -> confirm "Warning: you will only be able to activate it again when the game stops and no player is seated." |
| 17 | `Bomb pot?` | popover: 'With this options enabled, within a certain quantity of played hands, a "bomb pot" will happen, where all players will do a mandatory fixed amount bet in the pre-flop.' | Yes/No (Plus, 25 coins) | No | Plus | sub-fields `Probability for Bomb Pots (1% to 100%)` (default 5 on enabling) and `Bomb Pot Blinds Quantity` (default 2) |
| 18 | `Double Board?` | popover: "Two separate sets of community cards are dealt. Players aim to make the best hand on each board. Only for Texas Hold'em, Pot Limit Omaha Hi and Pot Limit Omaha 5 Hi. Run it Twice is not applied." | `Always` / `Bomb Pot` / `Off` (Plus) | Off | Plus | |
| 19 | `7-2 Bounty (paid per player to the winner)` | "Players that win a hand with a 7-2 hand will receive the bounty value from each player in the end of the hand (only for Hold'em hands)" | integer, placeholder `(Bounty)`, maxLength 6 (Plus) | empty | Plus | |
| 20 | `Nit Game?` | link to blog | Yes/No (Plus) | No | Plus | sub-fields `Nit prize per player (BB)` (default 5), `Minimum players to start Nit Game` (default 3). LIVE log line "Nit Minimum Players: off » 3" shows this default being recorded |
| 21 | `Allow Rebuy?` | "When enabled, busted players can immediately request a rebuy with a new stack value. The game owner must approve or reject each request." | Yes/No | No | owner | only shown for non-club 4fun tables |
| 22 | `Simulated Fee?` | "A certain percentage of each pot will be deducted as a simulated fee." | Yes/No | No | owner | enabling asks confirm: 'By clicking "confirm" I understand and accept that the simulated fee **is for training purposes only**. Poker Now is a free to play poker site. No purchase necessary.' then sets 2%, requires-flop No. Sub-fields `Simulated fee percentage per pot`, `Min. pot value to Fee (blank to unlimited)`, `Max rake value per pot (blank to unlimited)`, `Simulated Fee requires a seen Flop?`, counter `N Simulated fee Credits` + `Buy More Simualted Fee Credits` (sic). Needs credits, warning "This table has simulated fee enabled but no simulated fee credits available, please contact the game/club owner." Likely skip in PokerThen. |
| 23 | `Allow guests to send chat messages?` | 'Every player that has been in the table is considered as "guest"' | Yes/No | Yes | owner | |
| 24 | `Record table chat for Hand Replayer?` | "When enabled, table chat messages are saved with each hand and may appear in Hand Replayer and shared replays." | Yes/No | Yes | owner | when on, chat input shows a red recording dot with tooltip "This table chat is being recorded: messages are saved with each hand and may appear in Hand Replayer and shared replays." |
| 25 | `Auto trim excess bets?` | "When enabled, raises that exceed the maximum allowed bet based on the enemies stacks are trimmed down to the highest valid amount." | Yes/No | No | owner | |

Not present for a private table (LIVE + BUNDLE): max players (table always has 10 seats; the client loops seats 1-10; a max-players cap only exists for clubs), min/max buy-in (only club games: hint "minimum: X / maximum: Y"), ban/kick list (only "Remove Player"), pause/stop are table buttons not settings, add-on (clubs only), tournament-style timer = the multi-level blind table.

### 3.1 Blind levels table (BUNDLE + LIVE)
Columns: level number, `SB`, `BB`, `Ante` (only when Antes = Yes), `Duration (Min)`. Inputs: maxLength 6, digits only, placeholders `SB`, `BB`, `Ante`, `Duration`. Last row duration shows `∞` disabled input unless a duration was typed. A row can show a `Break` cell (SB = -1: full-width cell "Break", for tournaments). Rows after the first have an `X` remove button. Button `Add Another Level (or Press "+")` (full width, gray #4e4e4e, 14.04px bold uppercase) - hotkey `+` adds a level and focuses the penultimate duration field. Removing down to a single level deletes its ante cell.
When more than one level exists and a game is running: select `Countdown mode` with options `Only start next blind countdown in the hand's beginning` (value s) / `Never stop the countdown` (value c); and select `Restart blind clock at the level` with `Choose the Level` + `level 1..N`; error "You need to choose a blind reset level." Blind structure edits while running are locked (table dims to 7% opacity) with message "You need pause the game in order to change the blind structure." and button `Ok, I want pause the game now`. Header on table shows `NLH ~ 10 / 20` (LIVE, top-right under `OWNER: YASH`); next-blind text "Next Blind: ..." and "<n> minutes Break in".
Min/max/step for blind values, duration range: UNKNOWN (server validation).

### 3.2 Custom presets (landscape only)
Button `Custom Presets` opens popover: title row "Save current setup", input placeholder `Preset Name` (maxLength 15), button `Save`; empty state text "You can create presets to reuse your game configurations in other games." Each saved row: name, `Apply`, `X`. Max 5 presets: alert "You reached the max limit of 5 presets."; empty name: "You must define the preset name."; duplicate: "There's a preset with same name." Stored in browser localStorage key `presets` (per-device, not shared). Applying a preset ignores blinds/countdown when the blind structure is locked, and never changes the cents mode when locked.

## 4. Players screen (owner only)

### 4.1 List (LIVE)
One card per player ever seen, order: pending requests first (yellow-outlined card), then seated, then watchers. Card: name (large), grey chip `ID: <10-char id>`, status line, action buttons right-aligned. Status strings (BUNDLE verbatim): `Playing with <stack> stack`; `Waiting next turn to enter`; `Away`; `Requested Ingress with <stack> stack (Intended Seat Number: <n>)` (club-chips mode) / `Requested Ingress (Intended Seat Number: <n>)`; `Player will quit in the Next Turn`; `Watching`. Unnamed = `Guest`.
Buttons: pending -> green `Approve` (label `Approving` while loading) + red `Deny`; in-game/away/watching -> gray `Edit`. In 4fun mode Approve is a one-click approve using the intended stack; in club-chips mode it opens the edit screen. Allowed spectators show small text `Allowed to be Spectator` instead of Deny.
Toasts: `Player successfully approved.`, `Ingress request successfully rejected.`, `Whoops, something goes wrong.`, error loading list `Something wrong happened when loading the game's players.`

### 4.2 Quick Accept popup (LIVE screenshot host-table-clean.png)
When a seat request arrives the owner sees a white modal over the dimmed table: title `The player "<name>" wants to join the game!`, field `Intended Stack` (prefilled with requested stack, e.g. 1000), checkbox `do not show this again?` (sets preference showQuickAcceptPlayer=false), buttons red `Reject`, red `Ignore` (hides popup for that request only), green `Accept`. Toasts: `The player was approved successfully!`, `The player was rejected successfully!`, errors `Was not possible to accept this player, please try again in some minutes.` / `...reject this player...`. Can be re-enabled in Preferences "Show Quick Accept player warning?". Requests also appear as a badge on OPTIONS.

### 4.3 Edit player screen (LIVE: Dave seated; Bob watching)
Header: `<name> (ID: <id>)`. Seated/away/approving player: fieldset `PLAYER STACK` with `CURRENT <stack>`, segmented `ADD` (default) / `REMOVE` / `SET`, number input placeholder `Value`, green button; when approving a pending request the fieldset is replaced by a single input labelled `Player's Stack` (placeholder `Stack`). Button label: `Update Player` / `Approve Player` when table waiting or player standing up; otherwise `Update on Next Hand` / `Approve on Next Hand`; `Can't Update` (disabled) in chips-club mode; `Loading…`. Result toasts: `The player will be updated on next hand.` (hand running) / `Player successfully updated!`.
Right column red buttons (shown conditions): `Remove Player` (target is not me and seated/away; confirm "Are you sure that you want to remove this player from their seat?"; toast `The Player will be removed on next hand.` or `Player successfully removed.`); `Transfer Game Ownership` (any other player, even watchers - the only button for a watcher in LIVE; confirm "Are you sure that you want transfer the game ownership?"; toast "Game ownership successfully transferred."); `Allow Spectator Mode` / `Disallow Sepectator Mode` (sic) only if Spectator Mode setting is on (confirm "Are you sure that you want to allow this player to see the hole cards when not seated?"); `Put on Away Mode` (target seated in game, not me; confirm "Are you sure that you want to put this player in away mode?"; toast "The player entered in away mode." when game not waiting). Errors "Whoops, something wrong happened…". There is NO ban/kick-with-block: Remove only unseats; the player may re-request. UNKNOWN whether a removed player can re-join (not tested).
Player context menu at table (tap player's seat): `Edit Player` (owner), `Mute Chat`/`Unmute Chat`, `Report Player`, `Hide Avatar`/`Show Avatar`, `Report Avatar`, `Define Avatar` (self), `Add Chips to Stack` (self; clubs only), gestures, private notes.

## 5. Table-surface host controls and states (BUNDLE logic; LIVE where noted)
- `Start Game` (green, bottom-right area): owner only, status waiting, more than 1 player inGame, no Nit. POST `/games/{id}/start-game`; 422 shows window alert with server message (UNKNOWN text).
- `Shuffle Seats` (gray): same condition; sends RS.
- Invite panel (owner alone at table, sees `COPY LINK` button 140x33 at center-ish LIVE) texts: "Waiting for others", "Share this link with your friends!", `Copy Link` -> `Copied!`; also "Missing someone? Invite them", `Copy invite`.
- Pause: round dark-gray button `Toggle Pause`, tooltip "Pause the Game", hotkey `p`, owner only and only while a hand is in progress; sends UP / UR. Banner for everyone: `The room owner paused the game.`
- Stop: small button `Stop`, tooltip `Stop Game on Next Hand` (after click tooltip `Cancel Game Stop`, button red). Confirm text: "You are about to stop the game. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven." Owner only, only while hand in progress. After stop, status becomes waiting and Start Game / Shuffle Seats appear.
- `Next Hand »` (Enter key) when Auto start is No; non-owners see "Waiting for the owner to deal the next hand."
- Rebuy: busted player gets popup `Would you like to Rebuy?` field `Intended Stack`, buttons `Cancel` / `Confirm`, line "<n> seconds to take the decision"; others see "Waiting for busted players to make rebuy decision. (<n> seconds)"; owner then gets dialog `The player "<name>" requested a rebuy.` with `Approved Stack` input (prefilled), line `Requested stack: <n>`, buttons `Cancel` / `Approve`; others see "Waiting for the owner to approve/deny the pending rebuys. (<n> seconds)". Toast on server error: "Was not possible to request the rebuy. Please try again."; "Was not possible to resolve this rebuy request, please try again in some minutes."
- Add-on ("Add Chips to Stack") exists only in club tables: popup "How much do you want to add to your stack?", sub text "It will be added when the next hand starts.", field `Amount to Add`, `Cancel`/`Confirm`; toasts "The stack add-on was requested successfully, it will be applied when the next hand starts." / "The stack add-on was successfully applied on your stack." Not in private tables.
- Spectator warning (non-owner when Spectator Mode on, new spectator granted): modal "WARNING: new players allowed to be spectators (see hole cards) when unseated! Players: <names>" button `Ok, I am Aware!`. Spectator counter (bottom-left) "<n> seeing the hole cards"; click -> popover list `<name> (ID: <id>)` or "No spectator seeing the hole cards." Table felt turns red in spectator mode (BLOG). Banner "Spectator Mode Activated" with link "How does it works?".
- Seat request form (non-owner): title fields `Your Nickname` (maxLength 14, placeholder `Your Name`), `Intended Stack` (owner sees `Your Stack`), checkbox `Allow unseated players to see my hole cards` (only when Spectator Mode), optional checkbox `Sit with Away set`, submit `Request the Seat` (owner: `Take the Seat`; while loading `Requesting…`). After submit non-owner alert: "You requested this seat. Wait for the owner approval." and bottom button `Cancel Game Ingress Request` (red). Errors keyed `Player Name`, `Stack`. Min/max stack for private tables: none client side (server rules UNKNOWN).
- Away: top-left `Away` button (seated, in game, not already pending) sends SUNH ("sit up next hand"); becomes `I'm Back`. Status text under seat: `Away`, or hand status + ` (Away)`, `In Next Hand`, `Quitting`, ` (Offline)`, `Fold`, `Waiting`. While away with "Deal hands to away players?" = No the seat is skipped. `Return on Big Blind` only exists in the Lounge.
- Leave Seat: top-left `Leave Seat`; confirm "Are you sure that you want to leave your seat?" / "You will enter in check/fold mode until the hand's end." (button highlighted while pending; clicking again cancels).
- Disconnect: banner "Disconnected from the server" ... "because of inactivity, click here to reconnect."; offline players get an "offline time bank" bar.
- Other table messages: "Waiting for run it twice decisions", "Some players are seeing the undealt cards." (rabbit hunt), `Show All Cards` button with hotkey badge `s`, per-card buttons hotkeys `1`,`2`.
- Time bar under seat (`.time-to-talk`): redrawn every 100 ms; regular time bar and time-bank bar widths proportional to limit; when >70% of regular time (or of time bank when active) is consumed the bar turns red and an alert sound plays (current player only). Action button `Activate Extra Time (<n>s)` -> `Extra Time Activated`, hotkey `t`; preference auto-activates (default on).
- End-of-game flow: no "game over" screen for the table; the table remains. "Schedule next game" modal (owner, 4fun, after hand 1, opens automatically once per game when the game stops, and when owner leaves seat with <2 others): title `Good game!` / `Thanks for hosting!` / `Next game scheduled`; summary "<n> hand(s) · <duration> · <n> player(s) · Ledger" link; date tile + `Same time next week?` / `Next game` with `Change date`; datetime picker label `Date and time` (min now, max now+60 days); buttons `Not now`/`Cancel`, `Schedule next game`/`Save date`, `Done`, `Copy invite`; errors "Pick a time in the next 60 days.", "This table can no longer schedule the next game.", "Pick a time that has not passed.", "Something went wrong. Try again in a moment."; footnote "Your group gets one link for their calendar. The table opens when you start it."; guests see "Next time on another device? Sign in to start it from anywhere."; buttons `Google Calendar`, `Other calendar (.ics)`. Optional for PokerThen (needs accounts).

## 6. Player preferences ("PREFERENCES" tab, all roles; stored per device)
Stored in localStorage key `currentPlayer` (JSON; version 1) - not synced to server, except Auto Straddle (server action SSP). Defaults object in code: sound "med", deckStyle "two-color", autoActivateTimeBank true, showPromotionalAnnouncements true, showDefaultDesignTheme true, showQuickAcceptPlayer true, showSuggestedGesturePopover true, showVideoVoiceChatWarning true; everything else absent = off/none. All apply immediately. Top line: `Your User ID: <id>`. Order (LIVE):

| Label | Options | Default (LIVE) | Effect |
|---|---|---|---|
| `Deck Style` | `Four Colors` / `Two Colors` | Two Colors | adds CSS class `four-color` on the table container -> suits coloured (4-colour deck) |
| `Auto Straddle 2 Big Blinds when UTG?` | Yes / No | No | dimmed (50% opacity) with help "The game owner needs to allow straddle at the game configs." if owner setting off; sends SSP |
| `Hide the wins/re-entries count badges?` | Yes/No | No | |
| `Hide players' achievement Badges? (Displayed close to the Player name)` | Yes/No | No | |
| `Values Display Style` (help: "The apparence of the values on the game screen." + "Tip: you can toggle the Big Blind configuration pressing `b` key.") | `Big Blinds` / `Formatted` / `None` | None | `b` key toggles BB mode (remembers previous style); toast "You are now seeing the values as big blinds, to toggle it, press b"; bet button shows `Call 3BB` style suffix `BB` |
| `Hide Mood Emoji` | Yes/No | No | |
| `Disable Secondary Sound Effects? (Fold/Check/Bet/Card)` | Yes/No | No | |
| `Disable New Chat Message Beep?` | Yes/No | No | |
| `Run it Twice?` | Yes / No / `Ask each Time` | Ask each Time | auto-answers the RIT prompt |
| `Auto activate your extra time?` | Yes / No | Yes | |
| `Hide Hand Review Notification?` | Yes/No | No | |
| `Gestures Visibility` | `Hide` / `Sound Muted` / `Show` | Show | |
| `Show Promotional Content?` | `Show` / `Hide` | Show (disabled, Plus-gated) | |
| `Show Seasonal Table Theme?` | Show / Hide | Show | |
| `Show Quick Accept player warning?` | Show / Hide | Show | |
| `Show Suggested Gesture popover?` | Show / Hide | Show | |
| `Show video/voice chat enabled warning?` | Show / Hide | Show | |
(`Mute Guests in the Chat` appears only in tournaments.) Not in the preferences screen: sounds volume - it is the table-side round `SOUND` button (tooltip `Effects Volume`) at top-right under the owner label (LIVE x1232 y106, 49x49), cycling off -> low -> med -> high -> off with master volumes 0 / 0.15 / 0.45 / 1.0, default med (BLOG: "low (15%) / med (45%) / high (100%)"). No separate animations toggle, no themes list (only Plus "Define a Theme" and seasonal theme), no card-back option, no hotkey remapping exist.

Hotkeys found (BUNDLE): `k` check, `c` call, `r` bet/raise, `f` fold, `i` check-or-fold, `t` activate extra time, `m` open chat, `Esc` close chat/modals, `Enter` next hand (owner) / submit chat, `p` pause (owner), `b` toggle BB display, `l` open Log, `s` show all cards, `1`/`2` show individual card, `+` add blind level (config). Replayer: Left/Right prev/next frame, Up/Down prev/next hand, Space play/pause.

Chat options: Table vs Global channels only in tournaments. Chat input placeholder `Your Message (press Enter to submit)` maxLength 100; hint 'Click on the balloon and send a Message!'; `New Message` button; `Expand/Collapse`; muted players button `<n> muted` -> popover list with `Unmute`, empty "No players muted"; per message `Report` and `Mute`; `New Messages` indicator. Profanity filter auto messages from sender "Poker Now": "⚠️ Profanity is not allowed. Next offense in the next 10 minutes will result in a 10-minutes block.", "⚠️ You have been blocked from the chat for 10 minutes due to profanity.", "...for 24 hours due to profanity." (also "...for <n> minute(s)/hour(s)."). Owner can toggle guest chat (3, #23).

## 7. Log, ledger, replayer

### 7.1 Log/Ledger modal
Entry: bottom-left button `Log / Ledger` (landscape; `Log` in portrait) (LIVE 105x47 at x9 y605), hotkey `l`; long-press opens Ledger directly. Modal "Session Log": header title varies (`Session Log`, `Session Ledger`, `Game Replayer`, `Cash-in/Cash-Out Log`), `Close`. Bottom tab row: `Full Log`, `Ledger`, `Replayer` (Replayer opens in iframe in landscape, new tab in portrait). Bottom actions: pagination buttons `« Hand #<n+1>` and `Hand #<n-1> »` (shown on Full Log; LIVE: `HAND #3 »`), and `Download` (CSV, needs a captcha: "In order to download, please solve the captcha. Important: the log file is limited to 20,000 lines."). Empty: `Empty Log`; load errors: "Too many requests, please try again in some seconds." / "The log access is limited due the high load on servers. Please try again in some minutes." / "Something wrong happened when loading the log." Entries show time (24h `HH:MM`) then text, newest first; player names rendered as plain name with hover title `Player ID: <id>`; entries get CSS classes (start-game, entry-street, entry-collect, entry-fold, entry-raise [for raises to/bets/blinds], entry-check, entry-call) used for colouring. Current hand fetched from `/api/games/{id}/log_v3?hand_number=N` (hand 0 returns `[]`; older hands cached client-side, max 50).

### 7.2 Log line formats (LIVE verbatim, raw form with `"Name @ id"`; UI replaces `"Name @ id"` by `Name`)
Per-hand order (chronological):
```
The player "yash @ lOCSAx0p23" requested a seat.
The admin approved the player "yash @ lOCSAx0p23" participation with a stack of 1000.
Game Config Changes
* Allow Straddle: off » on
* Nit Minimum Players: off » 3
* Allow Rebuy: off » off
* Rabbit Hunt: off » on
* Allow Run it Twice: no » ask players
-- starting hand #1 (id: jxmorahjxvqp)  No Limit Texas Hold'em (dealer: "Carol @ nMe7gmdcCM") --
The player "yash @ lOCSAx0p23" joined the game with a stack of 1000.
Player stacks: #1 "yash @ lOCSAx0p23" (1000) | #2 "Bob @ 2nQAu2OoHX" (1000) | #3 "Carol @ ..." (1000) | #4 "Dave @ ..." (1000)
Your hand is 6♥, 8♦
"Dave @ lDCRMnhKeg" posts a small blind of 10
"yash @ lOCSAx0p23" posts a big blind of 20
"Bob @ ..." folds
"Carol @ ..." calls 20
"yash @ ..." checks
Flop:  [7♠, 9♣, 5♦]
"yash @ ..." bets 20
Turn: 7♠, 9♣, 5♦ [9♠]
River: 7♠, 9♣, 5♦, 9♠ [6♣]
"Dave @ ..." shows a 3♦, Q♥.
"yash @ ..." collected 120 from pot with Straight, 9 High (combination: 5♦, 6♣, 7♠, 8♦, 9♠)
-- ending hand #1 --
"Carol @ ..." raises to 960 and go all in
"Dave @ ..." calls 960 and go all in
Remaining players decide whether to run it twice.
Some players choose to not run it twice.
"Bob @ ..." chooses to  run it twice.            (two spaces after "to")
All players in hand choose to run it twice.
Flop (second run):  [9♥, 10♠, 4♥]    Turn (second run): 9♥, 10♠, 4♥ [5♦]    River (second run): 9♥, 10♠, 4♥, 5♦ [8♣]
"Dave @ ..." collected 180 from pot with Pair, A's on the second run  (combination: 8♣, 9♥, 10♠, A♣, A♠)
Uncalled bet of 960 returned to "Bob @ 2nQAu2OoHX"
"Bob @ ..." collected 40 from pot
The player "Bob @ 2nQAu2OoHX" quits the game with a stack of 0.
```
Notes: card format `rank` + suit glyph, ten = `10`; flop line has two spaces before `[`; "collected" lines for each pot/run (a side pot gives separate lines); a quits/joins line is logged under the hand that was in progress / next hand. "Your hand is ..." only for the viewing player. Hand #1 includes the join + config-change lines before its `-- starting hand` line; the Full Log hand with number 0 is empty. "Game Config Changes" lists fields as `* <Name>: <old> » <new>` (names seen: Allow Straddle, Nit Minimum Players, Allow Rebuy, Rabbit Hunt, Allow Run it Twice). The export CSV (not captured) has these same strings. UNKNOWN (not yet observed): lines for pause/resume/stop, rebuy/stack change by admin ("The admin ..."), straddle post, ante post, missed blinds, away/sit back, "removed", ownership transfer, bomb pot, 7-2. The replayer's own descriptions (BUNDLE) hint at: `posts ante`, `small blind`, `big blind`, `missing big blind`, `missing small blind`, `straddle`, `calls`, `bets`, `raises to` + ` and go all in`, `uncalled bet of`, `shows`, `collected ... with <hand>`, `Run it Twice Approved/Denied`, `7-2 Bounty Paid`, `Simulated fee of N taken from pot (p%)`.

### 7.3 Ledger (LIVE + BUNDLE)
Tab `Ledger` (title `Session Ledger`). Header cells `PLAYER`, `BUY-IN`, `BUY-OUT`, `STACK`, (`NIT ESCROW` only if any), `NET` - each a link that sorts; active sort shows arrow `↓` (desc) / `↑`; default sort Net desc; clicking same column toggles. Player row: `<name> @ <id>` (ids listed), button `Details`/`Hide Details`, then In / Out / Stack / Net (net prefixed `+` when positive, class positive-net/negative-net). Footer row `TABLE TOTAL` with sums (In, Out, Stack); optional line `Simulated Fee collected Value` with Out + Pending. Bottom-right green `Download` -> `/games/{id}/ledger_{id}.csv` (CSV fields: nickname, id, session start/end, buy-in, buy-out, stack, net). Details rows per session: label `hand #<start> until #<end|now>` or `Not Started Session`; chips `Took a Seat` / `Left the Seat` / `Add-on` / `Removed` / `Reset Stack` with value; In / Out / Stack / Net. Net = buy-out + current stack (+ escrow) - buy-in (BLOG). Disabled message: "Sorry, the ledger is not available in this type of game." LIVE example: Dave 1000/0/4000/+3000, Carol 1000/0/0/-1000, ..., TABLE TOTAL 4000/0/4000. Stack changes by admin (ADD/REMOVE/SET) appear as Add-on / Removed / Reset Stack movements. Access: all players (not owner-only).

### 7.4 Hand Replayer (separate page, public bundle read)
URL `/hand-replayer/game/{gameId}` [`/hand/{handId}` [`?frame=n`]]. Left sidebar: tabs `Game Hands` / `Saved Hands`, `Load File`, filters (Cards, suits All Suits/Suited (Same Suit)/Off-Suit (Different Suits), Order by Older/Newer Hands First, Higher Net Gain/Loss First, Game Type, Including Tags; `Apply`/`Clear`), warning "Hands are ... after 5 days!". Main: table replay, `Infos` (Number, ID, blind a/b (ante), started at, Variant), controls: `Prev Hand`, `Prev`, `Play/Pause`, `Next`, `Next Hand`, speed slider `Slow`..`Fast` range 1-5 step 1, timeline of frame buttons (street initials), `Share` popover "Shareable Link" ("Click to Copy"; checkboxes `Expose my Cards on the Shared Link?`, `Expose Chat Messages on the Shared Link?`, `Shared Link Starting from this point in the Hand?`; note "Shareable links don't show the other game/tournament hands."), `Save`/`Update` (Plus), `Hide table chat`/`Show table chat`. Errors: "Failed to Load the Hand Data", "Please Select One Hand to Replay". Hand-rank names list: Royal Flush, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, Pair, High Card.
PokerThen: replayer is optional; log + ledger are the must-haves.

## 8. Edge cases / rules gleaned
- Settings submit while a hand runs is queued to next hand; owner-only; non-owner sees disabled form.
- Blind structure with >1 level can't be edited mid-game without pause.
- Spectator Mode can be turned on only while nobody is seated (blog) and off-switch is guarded by confirm.
- Owner cannot Remove/Away themselves (buttons hidden when target is self) and can't transfer to self.
- Rebuy/seat requests auto-approval flag exists (`aCP` = auto approval) - UNKNOWN how set.
- Guest nickname max 14 chars; preset name max 15; chat message max 100.

## 9. UNKNOWN / needs owner help
- Server validation messages and numeric limits: min/max SB/BB/ante/duration, decision limit, time bank, stack field limits, max stack (errors come as 422 JSON, never seen).
- Exact log lines for: pause, resume, stop, owner stack change (add/remove/set), remove player, away/sit back, straddle, ante, missed blinds, ownership transfer, owner approve with different stack, rebuy approval, bomb pot/7-2/nit.
- Behaviour/timers after timeout (auto fold / auto sit-out thresholds, time-bank refill details, away auto-removal), what "Deal hands to away players" does to blinds, autoshow/automuck rules, show-hand button window (code: visible until next-step time minus 600 ms).
- Screens not captured live: non-owner (player) view of Game screen; Pause/Stop/Next Hand/Start Game buttons while a hand runs (table was waiting); rebuy popups; Schedule-next-game modal; Players list after removal; presets saved list; phone/tablet viewport captures of all settings screens (host tab was a fixed 1300x813 window; resizing is another agent's shared tab, not touched). Measurements recorded only at 1300 px wide.
- Whether a removed player can re-request a seat; whether blocking exists.
- What `Video/Audio` tab contains beyond device selectors `Video Device` (`No Video`) / `Audio Device` (`No Audio`) and `Apply Configs` (out of scope).

## 10. Evidence (research/evidence/settings/)
host-options-popover.png, host-config-game.png (+ -scroll1/2/3, host-config-presets.png), host-config-game.json (full labels/inputs/values), host-config-css.json (computed styles), config-css-excerpt.css (CSS rules extract from stylesheet lines 2190-2560), host-players.png, host-edit-seated.png, host-edit-watching.png, host-preferences.png (+ -scroll), host-video-audio.png, host-table-clean.png (Quick Accept modal), host-ledger.png, host-log-modal.png, log-raw-hands0-4.txt (raw log text), log-hand4.txt, blog-*.html (public blog posts), host-visible-buttons.txt, s*.mjs scripts.
Table state left as found: no settings changed; the Quick Accept popup for "PhoneP" was dismissed with Ignore (local only, request still pending in Players list); host tab returned to the table view; lock released.
