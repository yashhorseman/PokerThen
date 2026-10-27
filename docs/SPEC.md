# PokerThen - Build Specification (SPEC.md)

Single source of truth for builders. Consolidated and de-duplicated from `research/BRIEF.md` and `research/01..07`, plus the hosting brief. PokerThen is an EXACT clone of pokernow.com private Texas Hold'em tables (desktop and phone). Only artwork is original (felt colour, card back, logo, icons, sounds) plus ONE addition: provable fairness (section 20).

How to read this file
- Every value below was observed or read from the reference site unless tagged otherwise.
- Tags: **[OBS]** measured/seen live. **[CSS]** read from the reference stylesheet. **[JS]** read from the reference client code (logic restated). **[DOC]** official blog. **[ARCH]** architect decision (not research; marked so it can be revisited). **[STD]** standard Texas Hold'em rule used where research is silent but an engine must do something (still listed in section 22 if PokerNow behaviour is not verified).
- Anything not known is listed in section 22 (UNKNOWN). Builders must NOT invent values for those; use the named placeholder constant in `packages/shared/src/constants.ts` / `packages/engine/src/placeholders.ts` so the value can be swapped in one place.
- All UI text is rendered uppercase by CSS on buttons/tabs/segmented controls; DOM text is in the case quoted here. Strings in `code` are verbatim (including typos and double spaces).
- Units: `rem` = 3.2% of canvas height (section 3). `px` figures are at the stated viewport and are only for verification.

## 0. Source conflicts and how they were resolved (live-measured wins)

| # | Topic | Reports | Resolution |
|---|---|---|---|
| C1 | Seat rotation | 02 B1: "NOT rotated" (observed as spectator/host in seat 1). 03 s3.2 + 01 s8.2 + 05 s3.2 [JS]: seated viewer is rotated so own seat = position 1 | **Rotated for seated viewers** (live 03 hero in seat 6 saw seat 1 at position 6; 01 Joe seated at 2 appeared bottom centre). Spectators/unseated: positions = real seat numbers. 02's observation is consistent (host was seat 1). |
| C2 | Equity pills | 06 s2 [JS]: "no equity code in client". 05/06 s0/07: live `prob1` pills exist | **Equity pills exist** (server computed, section 13). |
| C3 | Turn glow colour | 02 [CSS]: `glow-current` to white `0 0 2.1em #fff`. 03 [CSS portrait]: lavender `0 0 3em 0 #c3bfff` | Landscape: white 2.1em. Portrait: lavender #c3bfff 3em. |
| C4 | Run-out street spacing | 06 s0: flop +1.1 s then +3.3 s per card (hand where RIT declined). 05 [OBS]+[JS], 07 [OBS]: exactly 4.0 s per street | **4000 ms** per street for all run-outs. The 1.1/3.3 s observation (non-RIT single run) is kept in UNKNOWN U-T3. |
| C5 | Award -> next hand delay | 02 B3: 3.004 s after fold-win. 05: `NSAGR` 2.9-3 s, `NSAGRS` 8 s. 07: 6.04 s after showdown (Normal presentation 6 s), 8.07 s after all-in run-out award | Fold-win: 3000 ms. Showdown without run-out: Showdown Presentation Time (Fast 3 / Normal 6 / Slow 9 s). All-in run-out award: 8 s observed at Normal (U-T4: whether it is 6 s + 2 s or fixed 8 s). |
| C6 | Preflop-all-in reveal timing | 06: reveal then flop 1.1 s; 07: reveal at +1.33 s after last RIT answer, flop at +4.0 s after reveal | 07 (4 s) |
| C7 | `time bank` default | 02 B3 table had 1 s bank (custom). 04: default 10 s. | Defaults 20 s limit / 10 s bank / 10 hands (section 10). |
| C8 | Away/stand-up lines | 04: status `Away`; 06/07 log `The player X stand up with the stack of N.` | Log wording as 06/07 (sic "stand up"). |
| C9 | Log casing of names | 04 s7.2 raw `"Name @ id"`; UI shows `Name` | Server stores raw `"Name @ id"`; client renders name only with tooltip `Player ID: <id>`. |
| C10 | 3-way hand-name chip colours | 02: red `#f75757`; 03/07: blue for opponents | Red = own/default; blue (#546eca-like indigo) = opponent chip at showdown [OBS 03 s13.6]. Exact blue UNKNOWN (U-V4). |

## 0.1 Scope decisions [ARCH]
Removed because they are community/monetisation/accounts/voice (BRIEF out-of-scope) or Plus-gated: sidebar community items (Find a Game, Sit & Go, Lounge, Final Table, Heads Up, Clubs, Highlights, Design Themes, Plus promo, Sign in), Polymarket/community promos, "Join a Live Game" option in the waiting banner, voice/video (JOIN box, Video/Audio tab, mic/camera), Plus features (Theme Design, Variant Rotation, Bomb Pot, Double Board, 7-2 Bounty, Nit Game, Simulated Fee, Save Current Hand, Custom Presets stay: free, see 10.4), gestures/emoji NC shop, avatars/badges (hidden on phone; guest plates have none), hand replayer page, Schedule next game, tournaments, clubs, waitlist, Poker-Now chat bot/ads/feedback/review-hand-promo popovers, Turnstile captcha (replaced by nothing: no captcha; log download is plain), `Sign In`/`Guest` account row in Options (no accounts).
Kept although unobserved fully: Allow Rebuy, Antes, Spectator Mode, Run it Twice, Rabbit Hunt, Straddle, Pause/Stop, Ledger, Log, Presets, mood Emoji (the "Select" emoji button; free emoji list UNKNOWN: U-E1), chat mute/report (Report = non-functional toast UNKNOWN; **omit Report**).
"Hand Review notification" (green REVIEW HAND popover, 07 s2): replayer is out of scope, so the popover is **omitted**; Preference `Hide Hand Review Notification?` kept (stored, no effect) to keep Preferences identical.

---
## 1. Pre-game: home, create game (01)

### 1.1 Routes [OBS]
- `/` landing and `/home` hub: PokerThen serves ONE page for both: the Home hub (1.2) [ARCH: PokerNow's marketing landing copy beyond the hero was not captured: U-H1].
- `/start-game`: New Game card (1.3). `/games/<gameID>`: table app (all roles). `/verify`: fairness page (section 20; the only added route).
- Unknown or invalid `/games/<id>`: HTTP 302 to `/`, no error text. [OBS]
- Page titles: home `Poker Now - Home` -> PokerThen uses **`PokerThen - Home`**; start-game `PokerThen - New Game - Private Poker with friends`; table `PokerThen - Poker with Friends` (brand word replaced, rest verbatim). meta description (start-game): `Start to play free private poker home game online with your friends! No download and no registration needed. Up to 10 people.`
- Fonts: `Mulish` (table app, weights 200,300,400,700,900), `Muli`->use Mulish everywhere, `Abril Fatface` (card ranks), `Josefin Sans` 300/400/700 (not needed). Self-host from `@fontsource` (OFL).
- Page globals mirrored: `showSitAsAway = true`; HTTP 202 on any API call forces `location.reload()` (keep this behaviour: `HTTP_202_RELOAD`).
- Body background rgb(32,30,31) `#201e1f` with a repeating pattern (own artwork); letterbox bars `#1f1f1f`-ish.

### 1.2 Home hub (`/home`) [OBS 01 s2]
Desktop 1440x900: fixed dark sidebar 240px wide (bg #282828), main `margin-left:240px` (var `--pn-sidebar-width`, collapsed 64px, transition .2s). Breakpoint **max-width 1024px**: sidebar becomes a 48px top app bar (logo left, hamburger right), main `margin-top:48px`.
- Page-title bar: house icon + `Home` (bold 17px, #3a3a3a, letter-spacing .34px, padding 11.9px/17px, height 49.6px, bottom border).
- Hero `.hub-home__hero` bg #f7f8fb, padding 22.95px, 2-col grid 649/440 gap 25.5px (single column on phone):
  - eyebrow `POKER NOW` -> PokerThen: `POKERTHEN` (13.94px/700 uppercase #646464)
  - h1 `Ready to play?` (39.95px/700, line-height 45px)
  - lead `Start a private table with friends or jump into games from the Poker Now community.` -> PokerThen lead: `Start a private table with friends.` [ARCH: community clause removed]
  - Buttons grid gap 11.9px, each 214x58, radius 4.08px, 15.3px/700 uppercase, letter-spacing 1.02px, white text: **START A NEW GAME** bg rgb(146,156,74) -> `/start-game` (FIND A GAME removed). Phone: full width 334x47.7.
- Footer `.main-footer`: `© PokerThen 2026` + links (colour #808080, underlined, 17px): Terms of Service, Privacy Policy [ARCH: only these; others point to community/support]. Phone: centred single column.
- Sidebar items kept: logo (links `/`), collapse button (24x24, desktop only), `Home`, group header `Play with Friends` (green #8cff7a, 15px/700) -> `New Game` (`/start-game`). Active item = white pill (radius 8px 0 0 22px) dark text. Mobile: hamburger (bordered rounded square) opens left drawer ~72% width with dimmed scrim.

### 1.3 New Game card (`/start-game`) [OBS 01 s3, SRC]

> **OWNER-APPROVED DEVIATION (2026-10-27):** the card has a second field after the nickname: label `Your Stack` + input (`inputmode=numeric`, `pattern=[0-9]*`, prefilled `1000`, placeholder `Your Stack`, same style as the nickname input). Whole number 1..1.000.000, error text `must be a value between 1 and 1.000.000` (same as the seat form). The POST body's `playerStack` carries the chosen value (the reference always sends 1000); the server validates it (422 `{stack}`) and seats the owner with it. Everything else in this section is unchanged and measured without this field; the card is one input taller than the reference.

- Background: the table-app canvas with a **blurred placeholder** image of a table (own artwork; transition `visibility .8s, opacity .8s linear`, z-index 30, hidden once connected).
- Canvas 1440x810 at y=45 on 1440x900; phone 390x844 -> canvas 390x702 at y=71. Root font-size = 0.032 x canvas height (25.92px desktop, 22.464px phone).
- Card `.waiting-container-center-container`: centred in canvas, bg rgba(0,0,0,.83), radius .6em (15.55px), padding `1em 1em 1.5em`, shadow `0 0 .5em rgba(0,0,0,.41)`, inner width 15em (388.8px). Desktop empty-state rect 440.6x476.8 at (499.7,211.6); phone 381.9x395.6 at (4.1,224.2).
- Contents top to bottom (verbatim):
  1. h1 `New Game` - .9em (23.3px), weight 100, uppercase, letter-spacing .5em (12.96px), centred, white, padding-bottom .8em + 1px bottom rule.
  2. p (.6em = 15.55px, #aaa, centred): `Play free private online poker with your friends.` `<br>` `No download and no registration needed.`
  3. label `Your Nickname` (.8em = 20.7px white).
  4. input text: `maxlength=14`, placeholder `Your Nickname`, `autofocus`, height 3em (77.75px), border 2px solid rgb(179,179,179) (phone 1px), radius .3em, padding `0 .8em`, font 1em white, bg transparent. No `required`, no client-side nickname check.
  5. (captcha slot omitted [ARCH]).
  6. Submit `button-1 green highlighted`: `Create Game` (uppercase, 700, 1em; bg rgb(63,167,108) `#3fa76c`, radius .3em, height 3.2em = 82.9px, full width). While submitting label = `Loading...`.
  7. p `.new-game-secondary-link`: `New to poker? ` + link `Learn the rules in our free interactive tutorial` (colour rgb(127,220,157), underline, new tab) + `.` -> PokerThen has no tutorial page: link target `/poker-tutorial` renders a one-page static "How to play Texas Hold'em" [ARCH; copy UNKNOWN U-H2].
- TOS bar `.tos-agreement`: fixed bottom, z 10, white bg, black 18.1px text, padding `.5em .8em`: `<b>Important:</b> by using Poker Now platform you accept our Terms of Service and Privacy Policy.` -> `Important: by using PokerThen you accept our Terms of Service and Privacy Policy.` [ARCH wording of brand] + button `Got it!` (green small 73.7x51.8). Click stores localStorage `acceptedTOS` = ISO date string; bar hidden when set. Shown on `/start-game` and on tables (covers bottom ~78px on desktop, ~90px phone).
- Behaviour: submit -> loading=true -> `POST /new-game` JSON `{playerName, gM:"th", playerStack:1000, bigBlind:20, smallBlind:10, cM:false}` (no `turnstileToken`). Success `{gameID, playerID, isNetworkPlayer:false, playerUsername}`; client `history.replaceState("", "", "/games/<gameID>")` (NO reload), sets document.title, mounts the table app. A friends game is created with fixed defaults: Hold'em, stack 1000, blinds 10/20; all else is changed later in Game Configurations.
- Failure: HTTP 422 object field->message; `errors.playerName` shown as `.error-message` (red) under the input; other statuses show nothing; `loading=false`. Server wording for /new-game empty nickname: UNKNOWN (U-J1); placeholder reuse of the seat rule `must be unique and length must be between 2 and 14` [ARCH placeholder].
- Connection phase: card `Connecting...` (same card style). Failure card: bold `Connection failed!` + `<br>` + default `Please check if the cookies are enabled and try again.`; code `too-many-connections`: `Your IP reached the max quantity of connections, please try to finish some other browser tabs/windows.`; `session-missing-token`: `Wasn't possible to detect your session. Please check if the cookies are enabled and try again.`; `too-many-actions`: `You were disconnected because you sent too many actions.`; or server `msg`. `locked` renders card titled `Warning` with server text.

### 1.4 Identity [OBS]
- Cookie `npt`-equivalent (PokerThen name `ptn`): HttpOnly, Secure, SameSite=Lax, Path=/, ~1 year expiry, 50-char URL-safe token, set on first request to ANY page. Player id = 10 chars of `[A-Za-z0-9_-]`. Identity is NOT in localStorage. Same cookie = same seat/host after reload. Fallback header `x-user-token` / socket query `ut` for cookie-less browsers [JS] (optional [ARCH]).
- Game id: `pgl` + 21 URL-safe chars (24 total) -> PokerThen uses prefix `ptl` + 21 chars [ARCH]; hand id 12 chars (e.g. `jxmorahjxvqp`).
- localStorage keys (all reads/writes in try/catch): `acceptedTOS`, `currentPlayer` (prefs JSON, section 16), `presets`, `bkp-chatMessage` (unsent draft), others omitted.

---
## 2. Join link, seat request, approval (01 s4, s8; 04 s4-5)

### 2.1 Opening an invite link [OBS]
The invite is just the table URL. Guests land directly on the table as spectators (status `watching`); no name prompt, no join page, no captcha. Seat count is always 10.

### 2.2 Spectator view before play
Top-left black tag with logo (120x28 at y=45); OPTIONS button column; top-right `OWNER: YASH`-style text + `NLH ~ 10 / 20`; SOUND button; bottom-left LOG / LEDGER; chat box (`It's a bit quiet here.` / `Click on the balloon and send a Message!`); felt text `No Limit Texas Hold'em`; pot `0` pill; watermark `POWERED BY POKER NOW` -> **omit** [ARCH]. 10 dashed seat slots, number top-left, `SIT` centred. Occupied seats show `WAITING` (clock icon) + name + stack before the first hand.

### 2.3 Sit popover `.popover-1.request-ingress-popover` [OBS]
White card with arrow toward the seat; desktop 311x351 at (738,236) for seat 1; bg #fff, radius .5em (12.96px), padding .9em (23.3px). Phone 256x289 at (66,319), radius 11.2px. Closes on outside click. Form `noValidate`.
Fields in order: label `Your Nickname` + input (maxlength 14, placeholder `Your Name`, type text, autofocus desktop only, prefilled with previous name for this cookie, text auto-selected on click); label `Intended Stack` (owner: `Your Stack`) + input (placeholder = label, `inputmode=numeric`, `pattern=[0-9]*`, `required` attr); checkbox `Allow unseated players to see my hole cards` (ONLY when Spectator Mode on); checkbox `Sit with Away set` (id `sit-as-away`); green button `Request the Seat` (owner: `Take the Seat`; while sending `Requesting…`, disabled).
Phone popover position by seat (portrait): seats 2,3 right of seat (`right:-12.5rem`), 4,5 same with `top:0`, 6 below seat (`top:4rem`), 7,8 left (`left:-12rem`), 9,10 left/bottom, seat 1 above (`bottom:3.4rem`). Phone inputs: x=80.8, w=217.7, h=46.9, font 17.97px, checkbox 27.7px, button 217.7x42.7.
Submit: `POST /games/<id>/request_ingress` `{seat, playerName, allowSpectator, stack, sitAsAway}` (stack Number, null if empty/non-numeric; sitAsAway omitted when unchecked); timeout 10 s.
Validation (HTTP 422, JSON field->message, red `.error-message` under input, popover stays open, button re-enabled):
| input | body |
|---|---|
| empty name + empty stack | `{"playerName":"must be unique and length must be between 2 and 14","stack":"must be a value between 1 and 1.000.000"}` |
| valid name, stack empty/abc/0/99999999999 | `{"stack":"must be a value between 1 and 1.000.000"}` (dot thousands separator verbatim) |
| name empty / 3 spaces / 1 char (trimmed), stack ok | `{"playerName":"must be unique and length must be between 2 and 14"}` |
| name equals an existing player's or pending requester's name | `{"playerName":"must be unique on this game"}` |
Accepted: trimmed name 2-14 chars, unique on the game, integer stack 1..1,000,000. Success: HTTP 200 text `OK`. Input truncates at 14 chars (no too-long error).
Other client behaviours: 403 `{code:"missing_game_player"}` -> hard reload; 422 on direct request shows alert `An error occurred when requesting the seat.` + lines `Player Name: <msg>` / `Stack: <msg>`.

### 2.4 Pending / approve / reject / cancel [OBS]
- After valid submit the guest sees a modal alert (white card, grey message bar, green `OK`, scrim; desktop ~778x200 centred; phone 24px side margins) with exactly `You requested this seat. Wait for the owner approval.`; popover stays behind with button `REQUESTING…`.
- While pending: status `requestedGameIngress`; seat slot shows nothing; a red full-size action button bottom-right (desktop 415x90 at ~(1007,751); phone 381px wide at bottom, class `cancel-request-ingress`, max-width 10rem in action-row layout): `Cancel Game Ingress Request`. Guest can still spectate and chat. Click -> returns to spectator state immediately (action `CANCEL_REQUEST_GAME_INGRESS`), no toast; host's pending modal for that player disappears.
- Owner side: OPTIONS button gets a red circular badge = number of pending requests; Options popover shows the count next to `Players`. A modal (white, centred, ~540px at 1300 wide) opens automatically, one request at a time (queue): title `The player "<Name>" wants to join the game!`; grey box with label `Intended Stack` + numeric input prefilled with requested stack (editable = approved stack); checkbox `do not show this again?` (sets pref `showQuickAcceptPlayer:false`); buttons left to right: red `Reject`, red `Ignore`, green `Accept`. Sound `new-player-beep` when the count rises.
- Accept: host alert `The player was approved successfully!` + OK; guest is seated (status WAITING clock icon, name, approved stack) within <1 s; guest UI becomes OPTIONS / LEAVE SEAT / AWAY. If a hand is running the player's status is `waitingNextGameToEnter` shown `IN NEXT HAND`.
- Reject: host alert `The player was rejected successfully!` + OK; guest gets NO message (alert/popover cleared, cancel button disappears, seat selectable again).
- Ignore: modal closes (local only); request stays pending, listed in Options > Players as `<Name> ID: <id>` / `Requested Ingress (Intended Seat Number: N)` with `APPROVE` and `DENY`; APPROVE opens `<Name> (ID: <id>)` page with `Player's Stack` input (prefilled with intended stack) + `APPROVE PLAYER` -> toast `Player successfully updated!`.
- Toast errors: `Was not possible to accept this player, please try again in some minutes.` / `Was not possible to reject this player, please try again in some minutes.`
- A stale request from a closed browser stays pending (and blocks that name) until the owner rejects it. [OBS; keep]
- Owner's first seat: the creator is created already seated (status inGame, `isOwner`).
- Seat requests from non-owner only if not tournament; spectators see `Sit`.
- Auto-approval flag `aCP` and `directRequestSeat`: not exposed (U-J3); omit.

### 2.5 Waiting banners (owner alone) [OBS]
`.table-warning-ctn.waiting-players-ctn` white rounded banner (desktop `left:50%; margin-left:-15rem; width:30rem; top:37%; min-height:4rem; bg #fff; radius 3rem; shadow 0 0 3rem rgba(146,146,146,.31); z 2`; text .7rem centred pre-line): title with clock icon `Waiting for others`; left column `Share this link with <b>your friends!</b>` + green button `Copy Link` (copies `location.href`; label flips to `Copied!` for 2000 ms then back). The "OR" divider disc and right column `Play with Poker Now community` / `Join a Live Game` are **omitted** [ARCH]. Visible to the owner while fewer than 2 players are seated. Phone: `.table-warning-ctn left:2.2rem; right:2.2rem; top:12.15rem; padding:.5rem; font .55rem; line-height .8rem; min-height 2.8rem`; `.waiting-players-ctn` padding .3rem, title .5rem, buttons .4rem font height 1.2rem.
When >=2 players are inGame and table status is `waiting`: owner sees bottom-right grey `Shuffle Seats` (`RS`) and green `Start Game` (`button-1 action-button green highlighted`). Click Start Game -> `POST /games/<id>/start-game` (no body); 422 -> `window.alert(response.data.value)` (strings UNKNOWN U-J2). Guests never see these buttons. Texts for others: `Waiting for the owner to deal the next hand.` (auto-deal off), pause `The room owner paused the game.`.

---
## 3. Scaling model: one scaled canvas (02 s1, 03 s1, 05 s11)

- The whole game lives in one `#canvas` (aspect-ratio box). A ResizeObserver on `#canvas` sets `html.style.fontSize = 0.032 * canvasHeightPx + "px"` and `--table-design-system-zoom = 16 / min(rootFontPx, 26)` (used by modals/forms to keep fixed UI sane). Every size is rem/%; no media queries for the table. 1rem = 3.2% of canvas height. Landscape canvas = 55.55 x 31.25 rem; portrait canvas = 17.36 x 31.25 rem.
- `<html>` class `landscape` | `portrait`. Mobile UA test `/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i` -> orientation from `screen.orientation.type` (startsWith "portrait"; fallback `window.orientation` abs==90 = landscape); non-mobile UA -> `matchMedia("(orientation: portrait)")`. Recomputed on `resize` and `orientationchange` (capture phase). Consequence: iPad portrait gets the phone layout; narrow desktop window gets portrait. **Builder rule:** recompute rem on every canvas resize AND after the class changes (the reference had a stale-rem quirk under emulated rotation).
- Canvas CSS: `#canvas{aspect-ratio:16/9; position:relative; display:flex; width:100%; overflow:hidden; box-shadow:0 0 2rem rgba(0,0,0,.34)}`; `#canvas.expanded{aspect-ratio:1.954/1}` (desktop only, JS-added only when not portrait; trigger UNKNOWN U-L1 -> not used); `.portrait #canvas{aspect-ratio:1/1.8}`; `@media(min-aspect-ratio:16/9){.landscape #canvas{width:auto;height:100%}}`; `@media(min-aspect-ratio:1/1.8){.portrait #canvas{width:auto;height:100%}}`; `#main-container{height:100%;width:100%;display:flex;align-items:center;justify-content:center}` (letterbox).
- Measured canvases: landscape 1440x900 -> 0,45,1440x810 rem 25.92; 1920x1080 -> rem 34.56; 1300x813 -> 0,40.9,1300x731.25 rem 23.4; 1024x768 -> 0,96,1024x576 rem 18.432; 768x1024 (iPad portrait UA) -> 99.6,0,568.9x1024 rem 32.768. Portrait: 390x844 -> 0,71,390x702 rem 22.464; 360x740 -> 0,46,360x648 rem 20.736; 430x932 -> 0,79,430x774 rem 24.768; 375x667 -> 2.2,0,370.6x667 rem 21.344. Phone landscape: 844x390 -> 75.3,0,693.3x390 rem 12.48 (tiny desktop copy; no special layout).
- No safe-area handling in the reference (no `env(safe-area-inset-*)`, no dvh/svh). [ARCH: keep identical; letterbox bars absorb notches on tall phones.]
- Viewport meta: `width=device-width, initial-scale=1, user-scalable=no`; `theme-color #272727`; `apple-mobile-web-app-capable=yes`; apple-touch-icon; manifest name/short_name `PokerThen`, theme/background `#272727`, no `display`/`orientation` keys.
- iOS keyboard handling [JS]: `focusin` on INPUT/TEXTAREA/contentEditable on mobile FREEZES the root font-size computation for that orientation while editing; iOS also freezes `<html>` height to the pre-keyboard height and scrolls the field into view via `visualViewport` (`scrollBy(0, fieldBottom - (vv.offsetTop+vv.height) + 8)`); `focusout` unfreezes, clears html height, `scrollTo(0,0)`, recomputes next animation frame. Chat form (phone sheet) translates up by `(formBottom - (vv.offsetTop+vv.height) + 8)px` while the keyboard is open. Inputs >= 16px (17.97px at 390) to avoid iOS zoom.
- Tap highlight transparent on buttons/links/`[role=button]`/`.clickable`; outline removed on focus; number input spinners removed; `::selection #2c8b55` on slider/number text.
- Backgrounds: `.game-main-container` = darkened textured room image (own art, near-black #232323..#2a2a2a), felt = raster/vector table image (own art). Default felt colours to REPLACE with own design: reference default felt centre #37A265, edge #298651, bottom #22653F, rail #212121, page #1E1E1E (own felt colour must differ: owner's table colour is original).

---
## 4. Table UI, DESKTOP (landscape) (02, 07)

All positions absolute inside `#canvas` unless stated; rem = 3.2% canvas height.

### 4.1 Layout map [CSS+OBS]
| Element | Class | Position / size |
|---|---|---|
| Table (felt + rail one image) | `.table` | `height 26.25rem; width 55.55rem; margin 0 auto; position relative` (ratio 2.116:1). Remaining ~5rem at bottom hosts chat/action bar |
| Left button column | `.top-buttons` | `left .5rem; top 1.5rem; width 2.8rem; z 3`; each `.top-buttons-button` 3rem x 2.8rem, border .05rem #454545, icon 1.5rem + .35rem uppercase label, colour #797979, highlight bg #353535, outer radius .2rem (first/last). Order: Options, Leave Seat (seated), Away/I'm Back (seated) |
| Game info (top right) | `.game-infos` | `right .8rem; top .25rem; height 2.5rem; flex column; align-items flex-end; z 2` |
| Right button column | `.top-right-buttons` | `right .8rem; top 2.8rem; width 2.1rem; z 20`; buttons 2.1x2.1rem gap .1rem: sound, spectators/not-seated players (eye), pause (owner), stop (owner) |
| Full-screen button | `.full-screen-button` | `top 7.25rem; right 3.3rem; 2.1x2.1rem; bg #000 opacity .3; radius .3rem` (shown only when Fullscreen API supported) |
| Chat | `.chat` | `left .4rem; bottom .5rem`; `.chat-container` 22.5 x 4.4rem (expanded 14rem, z 20), bg #2f2f2f, radius .3rem, font .7rem, colour #969696 |
| Log / Ledger button | `.aux-chat-bottom-buttons-ctn` | `left .4rem; top 24.1rem`; `.show-log-button` = `button-1 small-button dark-gray`, label `Log / Ledger`, hotkey badge `l`; measured 105x47 at (9,605) @1300 |
| Spectators count | `.spectators-count-ctn` | `top 23rem; left .6rem` (eye icon yellow + count) |
| Version/help links | `.help-link-game` / `.version-link-in-game` | omitted [ARCH] |
| Next Hand button | `.next-hand-button` | `top 17rem; left 50%; margin-left -4.5rem; width 9rem; bg rgba(255,255,255,.05); backdrop-filter blur(.1rem)`, badge `enter`; label `Next Hand »` |
| Centre message | `.room-owner-paused` | `top 16.8rem; font .73rem; bold; rgba(255,255,255,.5); centred full width`; `.rh-message` top 15rem font .5rem |
| Action bar | `.game-decisions-ctn` | `bottom .5rem; right .7rem; nowrap` |
| Disconnect banner | `.disconnect-warning` | `top 0; width 100%; padding .5rem; bg red; #fff; bold .7rem; z 201` text: `Disconnected from the server` ... `because of inactivity, click here to reconnect.` (full wording UNKNOWN U-L2) |
| Game type watermark | `.table-game-type` | `top 14rem; width 100%; centred; .85rem bold white; opacity .1`; text = `No Limit Texas Hold'em` (landscape only) |
| Pot | `.table-pot-size` | `top 24%; left 43.4%; width 13%; height 1.9rem` |
| Board | `.table-cards` | `top 35%; left 28%; width 24.2rem; flex; z 2` |

Measured @1440x900 (rem 25.92): seat plate 233.97x82.92px at rem 23.4; bet pill font .8rem; dealer button 1.9x1.6rem; pot box 13% x 1.9rem; board row 24.2rem; chat box 22.5x4.4rem; left buttons 3x2.8rem; top-right buttons 2.1rem; game-infos box ~136x58.5px at 1300.
Root-level looks: Options button measured 70x66 at (12,76) @1300.

### 4.2 Game info (top right) [OBS]
- Optional `Owner: <name>` (.5rem uppercase #777), rendered `OWNER: YASH`.
- Line 2: `<TYPE> ~ <SB> / <BB>`, bold uppercase #9b9b9b .9rem; `~` small. TYPE = `NLH` (PokerThen only Hold'em; shown as in reference `NLH ~ 10 / 20`). With antes: ` (A: ante)` suffix. Blind timer line when multi-level: `Next Blind: sb/bb (A: x) in mm:ss` (#e44444 .55rem uppercase); during break `<n> minutes Break in` (U-G6 exact).

### 4.3 Felt, rail, themes
`.table` image: default theme only (seasonal themes and Plus themes are out of scope). `.table.red` (felt variant) is applied when spectator/god mode is on (`sPM`): PokerThen: red-tinted felt variant. `.table.glow:before` overlay png, opacity 0->1, `transition-duration .5s` (glow state trigger UNKNOWN U-V1; not used). Colours of PokerThen felt/rail/background are own artwork (section 18.3).

### 4.4 Seats (10 fixed slots)
Slot `.table-player.table-player-N` size `18% x 13.5%` of the table box (10.0 x 3.54rem); z 4 (slot 1: 5). Positions (top %, left % of table box):
| slot | top | left | place |
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
- No per-player-count formation: 2..10 players use the same slots. **Seated viewer: rotated so own seat is position 1**, others keep clockwise order (resolution C1): position p shows real seat `((mySeat - 1 + p - 1) % 10) + 1`; empty seats then show their REAL seat numbers on the rotated positions. Spectator / unseated viewer: position = real seat number. Empty-seat boxes are drawn only for viewers who can sit (spectator/unseated, status watching/waiting, seats < 10); a seated viewer sees only occupied slots.
- Empty seat `.table-player-seat`: `border 1px dashed rgba(255,255,255,.1); radius .3rem`; number `.table-player-seat-position-number` top-left (#4e4c4c, .8rem, weight lighter, top/left .5rem; hover #ccc); centred `Sit` (`.table-player-seat-button` .6rem uppercase letter-spacing .2rem colour #888; selected border/text #fff). Click opens the Sit popover (2.3).

### 4.5 Player plate `.table-player-infos-ctn`
- Fills the seat box: bg `rgba(51,51,51,.76)`, radius .3rem, shadow `0 0 .6em rgba(0,0,0,.25)`, overflow hidden, bold.
- Name `.table-player-name`: `left 5.2rem; top .9rem; width 4.5rem; height .9rem; font .7em; colour #c3c3c3; nowrap; overflow hidden`; dotted underline #575757. Auto-shrink measured at mount (scrollWidth - offsetWidth): >0 -> `.65em`; >10px -> `.58em`; >30px -> `.42em`. 4/5-card hands: width 4.3rem left 5.3rem. Name title attr shows nothing special.
- Stack `.table-player-stack`: `left 5.2rem; top 1.8rem; width 3.8rem; line-height .8rem; .7rem; #fff`. Shows stack minus current-street bet; `All In` when 0 (and no gain). After a result: `<stack before gain> [+gain pill]`, pill `.table-player-stack-prize` white on #7b8a50 (rgb(123,138,80)), padding `0 .28rem`, radius .15rem, bold 18.14px @1440 (68.9x23); negative gain: red bg, no `+`. Pill stays until the next hand deals.
- Left ~5rem of the plate = hole-card area (cards overhang left by .9rem). Folded/quitting status icon (large grey X + caption `FOLD`; exit-arrow + `QUITTING`) occupies this area.
- Status text `.table-player-status-icon`: `Fold`, `Waiting` (clock icon), `Away`, `In Next Hand`, `Quitting`; suffixes ` (Away)` and ` (Offline)`; shown `FOLD (OFFLINE)` / `OFFLINE` chips. Folded/standing plates text opacity .6. Offline seat `filter: grayscale(1)`. Last-action text under the seat (e.g. `check`) is a speech-bubble style label.
- Turn highlight `.decision-current`: plate bg #fff, name #3c4218, stack #000, `::before` overlay animation `glow-current .4s forwards` (box-shadow `0 0 0 0 #fff` -> `0 0 2.1em 0 #fff`).
- Winner `.winner`: plate bg #fff; shadow `0 0 .6em rgba(0,0,0,.25), inset 0 0 2.6em rgba(223,245,43,.48)`; `::before` chain: `glow-grow 1s` (0 -> 3em #e9ff63), `glow-decrease 1s` delay 1s (3em -> 2em), `glow-pulse 2s` delay 2s (2em -> 3em @50% -> 2em), all `forwards`.
- `You` plate text colour #5e5bc3. Signal pills (win count #49a16e, re-buy/leave count #ab4343) 1.1rem tall, .5rem bold white at plate top-right (e.g. green `4`, red `2`); win count = trophy badge; `Hide the wins/re-entries count badges?` pref hides.
- Mood emoji (set 1.82rem) at plate top-right area (`.emoji-container` right -.8rem top 1.5rem). Chat bubble `.table-player-chat-message`: bg #546eca, white .6rem (15.55px), radius .2rem, shadow `0 0 7.8px rgba(0,0,0,.4)`, z 6, tail pointing up to plate; placed just below the plate; text truncated to 30 chars + `…`; DOM added instantly, removed after 7.2 s (hypothesis 7000+render; chat bubble lifetime formula in code = `2300 + 300*wordCount` ms, see U-C1).
- Per-seat click menu `.player-controls-popover`: `Hide Avatar`/`Show Avatar` (kept: toggles emoji/avatar visibility only [ARCH]), `Mute Chat`/`Unmute Chat`, `Edit Player` (owner). Others omitted (Report*, Define Avatar, Add Chips (clubs), gestures, notes).

### 4.6 Dealer / straddle discs
`.dealer-button-ctn` z 5, `transition-duration .5s` (slides between slot positions), image 1.9 x 1.6rem; dead button opacity .5. Dealer = white disc with blue `D`; live straddle = white disc with red `S` (second disc offset when on the dealer's seat). No SB/BB markers. Position (top rem, left rem) by slot: 1: 19.7/28.5; 2: 19.4/19.7; 3: 18.1/15.7; 4: 13.6/11.0; 5: 7.7/12.3; 6: 4.5/25.2; 7: 4.5/28.5; 8: 8.5/40.7; 9: 14.4/42.7; 10: 18.1/37.9. (Slots are the rotated positions for seated viewers.)

### 4.7 Bets and pot
- No chip art. Bet pill `.table-player-bet-value` (z 52): .8rem bold, bg #eaffba (rgb(234,255,186)), shadow `0 0 .3em #286543, inset 0 0 1.5em #e4fd14`, radius 5vh, colour #000, padding `4% 7%`; measured 55.2x42.2px at rem 23.4. Check = white pill (`.check`, inset #f5f5f5) text `check` (not shown for folded). Number formats: integer, cents (2 decimals), or `<n>BB` (BB display mode). Pills stay while the street is in progress; all vanish in one frame at award.
- Pill position relative to seat box: 1 top -78% left 9%; 2 top -78% left 55%; 3 top -30% left 103%; 4 top 21% left 107%; 5 top 82% left 102%; 6 top 130% left 45%; 7 top 130% left 18%; 8 right 103% top 82%; 9 right 110% top 22%; 10 right 105% top -32%.
- Pot `.table-pot-size .main-value`: centred white bold 1.1em, line-height 1.9rem, no background; shows pot collected from PREVIOUS streets (0 during first betting round). If displayed pot != full pot, pill `.add-on` (top -.32rem, right aligned, bg #00000040, white .65rem, radius 2rem, blur 1rem) with `total <fullPot>` (small `total` .35rem #ffffffa3); fades `.5s` opacity. After a street completes the add-on disappears when bets are collected. No separate side-pot widgets (U-S1: none observed while betting continues).
- At showdown the centre shows total then 0 after award.
- No chip movement animations at all (bets vanish, stack jumps, `+gain` pill appears).

### 4.8 Cards (desktop)
- Sizes (rem w x h): hole `med` 3.05 x 3.7 (font 1.3rem; effective measured 3.48x4.04 incl. container = 90.1x104.8px @1440); 4 cards `small` 3 x 3.63; 5 cards `small-2` 2.7075 x 3.276 (font 1.17rem); board `big` 4.5 x 5.5 (font 2rem; measured 116.6x142.5px, pitch 127px). Radius 7%. Shadows: general `0 .2rem .2rem rgba(0,0,0,.19)`; board `0 0 .5rem rgba(0,0,0,.25)`; hole `0 0 .8rem rgba(0,0,0,.4)`.
- Face: white; rank (T shown `10`) in `Abril Fatface` at `top 7%; left 18%; height 21%`; suit glyph (own icon font/SVG) 1.9rem board / 1.28rem hole at `top 53%; left 38%`. `sub-suit` mode (4/5-card holds, phone, video; forced for hero on phone): rank font .8em left 4% top -.1rem; small suit .55em left 6% top 33%; big suit top 48%.
- Colours: two-colour (default): h,d `#db3131`; s,c `#2c2c2c`. Four-colour: h `#db3131`, d `#4747ea`, s `#000`, c `#17b717` (pref `Deck Style`). Card back = own artwork (pattern).
- Hole fan `.table-player-cards`: `left -.9rem; top -.1rem; z 3`; card 1 `rotate(-7deg) left .3rem`; card 2 `rotate(7deg) left 2.65rem` (card 2 at +60.9px @rem 25.92). Own hole cards face up; others' backs. 4 cards: rotations -28/-8/11/31deg, left 0/.85/1.7/2.55rem, outer cards top .3rem. 5 cards: -32/-16/... (remaining CSS values UNKNOWN U-V5; Hold'em uses 2 cards only so not needed).
- Winning cards raised: class `up` -> `top -.2rem` (hole) / `-.5rem` (board), `transition-duration .5s`; non-winning board cards `semi-hide` (filter brightness 35%/low opacity). Folded: cards fade (`hide-cards`: opacity 0, top .2rem, .5s); your own folded cards stay visible dimmed (brightness 35%) in your seat. `sneak` = 40% opacity back overlay, applied ONLY to a face you can see that is not your own and not showing to everyone (e.g. a spectator/god-mode view of a hidden hand); NEVER on your own hole cards (reference client rule: class `sneak` unless the card belongs to the viewer or is showing).
- Hand-name chip `.player-hand-message-ctn` (z 50; top 3.3rem; left -.8rem; min-width 5.9rem; max-width 7rem): red `#f75757` uppercase .5rem white text, radius .2rem; text e.g. `PAIR (6)`; own hand strength shown live from the flop on; two runs: class `two-runs`, two rows `#1` (#6d64e0 active) / `#2` (#d82525), 152.9x33.7px desktop; at award the winning row gets `active`; also `Away`, `Offline`, `Offline & Away`; rabbit-hunt variant `(RH: PAIR (J))` red chip.
- Board `.table-cards`: `top 35%; left 28%; width 24.2rem; flex; z 2`; cards `margin-right .4rem` (5x4.5 + 4x.4 = 24.1rem). Cards fill slots left to right, not re-centred as they arrive (phone-verified; desktop row is centred on the 5-slot width). Run 2 row `.table-cards.run-2` (z 2): cards class `after-padding`, offset +14.4px x and +54.5px y from run 1 at 1440 (= +.556rem x, +2.1rem y) overlapping the lower 88px of row 1 (run 2 on top); row 1 cards get `semi-hide` once run 2 begins. Second board CSS `top 43%; left 29%`.
- Flip: card inserted face-down, then class `flipped` added; `.card-flipper-animated` only if `window.chrome`: transition `.15s` ease, rotateY 0 -> 180deg, perspective 1000px, backface hidden (not in Chrome: instant). PokerThen: use the animation on every browser [ARCH; the reference's instant flip elsewhere is a degradation]. Sequence: flop = 3 cards inserted in ONE tick, flips at +146/+154/+154 ms (150 ms stagger, min spacing 150 ms, polling every 50 ms); turn/river single card inserted then flipped +153 ms later. Each flip plays `card-place` (unless secondary sounds disabled). First mount (reconnect) shows existing cards already flipped.
- Rabbit slots: see section 14.

### 4.9 Table banners and free text
- `Waiting for others` (2.5). `First deal in mm:ss` (tournament only: omit). `This table is waiting for new players. Please wait a moment.` (waitlist/tournament: omit).
- Centre text lines (`.room-owner-paused` slot, under pot): `Waiting for the owner to deal the next hand.`; `The room owner paused the game.`; `Waiting for busted players to make rebuy decision. (n seconds)`; `Waiting for the owner to approve/deny the pending rebuys. (n seconds)`; `Some players are seeing the undealt cards.`; `Waiting for run it twice decisions (ns)` (countdown of whole seconds, floor, never below 0, refreshed every 80 ms; 9s first); `Spectator Mode Activated` with link `How does it works?` (U-G4: link target); desktop 1439.8x24 at y=480.5, bold 18.92px, rgba(255,255,255,.5).
- Buttons: `Next Hand »` (owner, auto-deal off). `Show All Cards` + per-card toggles (section 12.3). Rebuy popup (section 8.6).
- Toasts/alerts: modal alert style (`alert-1`): white rounded card centred, grey rounded message box, buttons right-aligned (OK green; CANCEL red / CONFIRM green), scrim; desktop alert width ~778px; Leave Seat dialog (phone) 370.5x195.8 at (9.8,324.1).
- Spectator count (bottom-left): `<n> seeing the hole cards`; click -> popover list `<name> (ID: <id>)` or `No spectator seeing the hole cards.`

---
## 5. Table UI, PHONE (portrait) (03, 07 s7)

### 5.1 Canvas
Portrait canvas 1:1.8 (17.36 x 31.25 rem). Viewport taller than 1:1.8 (390x844): full width, height 1.8*width, vertically centred. Less tall (375x667, tablets): full height, width = height/1.8, centred. `layout=m` is reported to the server for portrait, `d` for landscape.
Phone landscape = desktop layout at small rem; there is no rotate prompt (`.landscape-warning` CSS is dead).

### 5.2 Table, pot, board, info (portrait CSS)
- `.portrait .table`: `height:28rem; width:17.4rem; background-size:auto 28rem; no-repeat`: vertical felt image (own art), red variant for spectator mode. Remaining 3.25rem = chat/log/fullscreen strip. Measured 390x844: table box 0,71,390.9x629.
- Pot `.table-pot-size`: `left:6.7rem; top:10.95rem; width:3.9rem; height:1.1rem`; value `.7rem`, line-height 1.1rem; add-on `top:-.35rem; height:.6rem; font .35rem` (`total` label .3rem). Measured: pot box 150.5,317, 87.6x24.7; value font 15.72px.
- Board `.table-cards`: `transform-origin:0 0; transform:scale(.54); top:12.45rem; left:2.2rem`; card on screen 4.5*.54 x 5.5*.54 rem = 54.6x66.7px @390, step 59.4px, first card x=49.4, y=350.7. Run-2: `.run-2 top:48.5%; left:15%` (measured run 2 at x=58.6,y=376 = +9.2,+25.3px). Slots fill left to right.
- `.table-game-type` not rendered on phone.
- `.game-infos`: `top:16.5rem; width:100%; left:0; align-items:center; z-index:4` centred; line 1 `OWNER: YASH` (.4rem, #d1ffe6); line 2 `NLH ~ 10 / 20` (.45rem #d1ffe6; type .7rem). Measured box 0,441.6,390x56.2.
- Dealer button 1.2 x 1.2rem; positions by dealer slot (top,left rem): 1:(23,6.2) 2:(22.4,5.2) 3:(17.9,5.2) 4:(10.1,5.2) 5:(4.9,5.2) 6:(3.9,6.2) 7:(4.9,10.9) 8:(10.1,10.9) 9:(17.9,10.9) 10:(22.4,10.9); second disc offset .8rem; transition .5s.

### 5.3 Seat anchors (portrait; origin = canvas top-left)
Seat box `.table-player {width:5rem; height:3.95rem}`; info plate `.table-player-infos-ctn` `bottom:0; height:1.9rem; background:#333; z 4; box-shadow 0 0 .5em rgba(0,0,0,.25)`; cards stick out above.
| pos | top | left/right |
|---|---|---|
| 1 | 24 | left 6.2 |
| 2 | 20 | left .1 |
| 3 | 15.5 | left .1 |
| 4 | 7.7 | left .1 |
| 5 | 3 | left .1 |
| 6 | 0 | left 6.2 |
| 7 | 3 | right .1 |
| 8 | 7.7 | right .1 |
| 9 | 15.5 | right .1 |
| 10 | 20 | right .1 |
Measured @390 (x,y of box 114.3x90.7 incl border; occupied 112.3x88.7): 1:(139.3,610.1) 2:(2.2,520.3) 3:(2.2,419.2) 4:(2.2,244) 5:(2.2,138.4) 6:(139.3,71) 7:(274.3,138.4) 8:(274.3,244) 9:(274.3,419.2) 10:(274.3,520.3). Seats overlap the table image edges. Same rotation rule as desktop (C1).
Empty seat portrait: dashed border `rgba(255,255,255,.3)`, number `.5rem` rgba(255,255,255,.5) (hover white), label `SIT` `.5rem`, letter-spacing .2rem uppercase #fff.

### 5.4 Occupied seat anatomy (portrait)
- Name `.table-player-name`: `left:.5rem; top:.38rem; font-size:.5em; height:.5rem; max-width:4.4rem; background:#333; z 2` (dotted underline); measured name font 11.23px @390. Stack `left:.5rem; top:.9rem; font-size:.5rem; width:max-content; background:#333`.
- Avatar hidden. Hole cards `.table-player-cards{transform:scale(.72); left:.4rem; top:.1rem}`; hero card measured 56.2x65.4px at x=149.6 and 187.6 (step 38px = 1.69rem, overlap 18px), y=609.6, rotation about +-7deg, overlapping the plate top by ~10px. Hero cards ALWAYS sub-suit (`forceSubSuit` portrait).
- Bet bubble `.table-player-bet-value` portrait `.6rem`; positions relative to the seat box: right-column seats 7,8,9,10: `right:100%` (bubble left of seat), top 1.1rem (8,9,10) / 3.24rem (7); left seats 2,3,4: `left:95%; top:1.1rem`; seat 5: `left:95%; top:3.24rem`; seat 6: `top:4.15rem; left:20%`; seat 1: `top:-1.43rem; left:20%`. Hero bet measured 31.9x26px at (161.7,578).
- Active/winner: plate white (`#fff` stack and name backgrounds) + glow (decision lavender `0 0 3em 0 #c3bfff`, winner `#e9ff63` + inset yellow glow); timer bar `.time-to-talk{width:5rem; height:.15rem; left:0}` under plate.
- Status icon `.table-player-status-icon{width:2.3rem; height:2rem; top:.51rem; font-size:.3rem; background:rgba(0,0,0,.72); radius .3rem}` hidden for `fold`. Hand message `right:0; top:1.86rem; --size:.7rem; max-width:100%` (two runs top 1.76rem); hero chip measured 39.3x11.8 at the plate top-right, font ~.45rem.
- Equity pills / signals scaled `.75` (pill container `scale(.72)`: 30.7x17.8px, font 11.23px, radius 18.4px, sits at top-right of the fan). `.player-table-signals-container.top`, emoji picker button, emoji container, spectators-count: hidden. Notes signal: not used.
- Chat bubble phone: 69.2x22px, font 10.1px (.45rem), radius 4.49px, z 100, directly under the plate, tail up.

### 5.5 Chrome (portrait)
| element | CSS | measured @390x844 |
|---|---|---|
| Options `.top-buttons` | `top:.3rem; left:.3rem; transform:scale(.8); origin 0 0`; button width 2.4rem; no border/radius; white text | 6.7,77.7,43.1x50.3 |
| Seated top-left row | OPTIONS \| LEAVE SEAT \| AWAY horizontal, icon above uppercase label | -- |
| Sound `.top-right-buttons` | `top:.2rem; right:.1rem; scale(.65) origin 100% 0` | 354.2,75.5,33.6x32.1 |
| Chat/Log stack `.aux-chat-bottom-buttons-ctn` | `left:.2rem; top:25rem; width:3.7rem; height:2.65rem; border:.05rem solid #787878; radius .25rem; 2 rows; blur backdrop; font .4rem` | chat 5.5,633.6,83.1x30.3; log 5.5,663.9,83.1x29.3 |
| Fullscreen | `bottom:5.5rem; right:.2rem; scale(.78) origin 100% 100%` | 348.7,612.7,36.8x36.8 |
| Next hand | `width:5.5rem; margin-left:-2.75rem; top:19rem; left:50%`, no tip badge | |
| Game actions | `position:absolute; left:.2rem; right:.2rem; bottom:.4rem` | 4.5,764,381 wide |
| `.suspended-action` | `bottom:2.6rem (high 3.2rem); right:0; width:5.6rem; height:1.5rem; font .45rem` | |
Hotkey badges hidden (`.button-1.with-tip:before`, `.action-button:before` display none). No hotkey hints on phone; hotkeys still active with a hardware keyboard (disabled for `isMobile` per [JS]; builder: disable on mobile UA).
Hidden on phone: table game-type text, avatars, emoji picker, spectator count, help link, expand button, tips on top-right buttons.
Phone differences: Log label `Log` (desktop `Log / Ledger`); Chat = `Chat` / `Chat (N)` button + bottom sheet; chat empty state only `It's a bit quiet here.`; Options popover opens downward (arrow top-left): `top:2.9rem; left:0; min-width:7rem` (measured 6.7,129.8,186.3x206.8); notice popover `width:9rem; top:2.9rem; left:0; notice font .5rem`; Full Screen button visible only on mobile UA when Fullscreen API is supported and not already fullscreen (icon-only).
Seated away state: AWAY becomes `I'M BACK` (chair icon, grey label) and a green `I'M BACK` action button (112.3x51.7 at 273.2,712.4; class `action-button green highlighted iamback`, max-width 5rem) appears at bottom-right; plate white; status text `AWAY` replaces stack text.
Time-bank chip (white pill `EXTRA TIME ACTIVATED`, class `time-bank suspended-action highlighted`) 125.8x33.7 at (259.7,671.9), raised to y=658.5 when the raise controller is open.

### 5.6 Phone modals and sheets
- New-style modals (`pn-modal`) are full-screen sheets at <=600px width (floating variant keeps `calc(100% - 2*--pn-space-3)` margins, `max-height calc(100% - 2*--pn-space-5)`, radius `--pn-radius-md`). `@media(max-width:600px){.pn-text-display{font-size:var(--pn-text-xl);line-height:1.15}.pn-subnav{gap:var(--pn-space-2)}}`. Old-style modals portrait: `.modal{margin:.5rem; width:100%; height:initial}`, `.modal-body{height:27rem}`.
- Log modal portrait `height:95%` (measured 11.2,88.5,367.5x666.9; white card, rounded, X close top right, dark backdrop).
- Gestures: only custom gesture = long-press (500 ms, pointer events; the following click swallowed) on the Log button -> opens Ledger directly. No swipe/double-tap. Pinch zoom disabled.

---
## 6. Action bar, bet panel, pre-actions, hotkeys (02 s9, 03 s5/13, 05 s5, 06)

### 6.1 Buttons (`.button-1.action-button`)
- Desktop: height 3.5rem, padding `0 1.2rem`, font .8rem, gap .5rem; order left to right: Call/Bet quick label, Raise/Bet, Check, Fold; `.raise` width 6rem; bar `bottom:.5rem; right:.7rem`. Phone: `flex:1; font .5rem; padding 0 .3rem; height 2.3rem; line-height 2.3rem; gap .2rem`; max-widths `raise`,`call` 4.9rem, `check`,`fold` 3.3rem, `iamback` 5rem, `cancel-request-ingress` 10rem. Measured @390: height 51.7px, font 11.2px (.5rem), gap 4.5px; Call 109.7 wide, Raise 109.7, Check 74.1, Fold 74.1; radius 6.74px (.3rem); 1-2px outline with 3px thicker bottom border.
- `.button-1`: transparent bg, border .08rem (bottom .15rem), radius .3rem, bold uppercase. Colours: green `#39af6b` (highlighted bg `#3fa76c`, bottom `#348959`), red `#fc4117` (highlighted `#c15942`), gray `#b9b9b9` (highlighted `#7b7b7b`), yellow `#ffea00`, blue `#7f7df5`, dark-gray. Disabled opacity .25 (still occupies its slot: the bar always shows 4 slots). Hotkey badge `:before top -.28rem right .5rem bg #232122 white .5rem bold`. Fold = red; check/call = green; raise = yellow per phone measure (text/border rgb(57,175,107) call/check, fold rgb(252,65,23); raise colour yellow `#ffea00` [CSS]).
- Container opacity .3 (`.low`, hover 1) when not your turn.
- After any click on your turn all buttons disable for 750 ms (re-enabled sooner on a new turn). Per-button throttle intervals: Yes/No 190 ms, Away 300 ms, Leave 200 ms, Pause 400 ms, Next Hand 400 ms.
- Labels: Call button `Call <amt>` (amt = highest bet - your bet); amt = 0 -> `Bet <bigBlind>`; amt >= stack -> `All In <stack>`; BB display mode appends `BB`. Raise button `Raise` if a bet exists else `Bet`. Check/Fold always rendered.
- Rules: Check enabled if highest bet is 0/"check", OR all-in, OR you are in the BB-option list (`wBACPI`). Call shown if not all-in and highest bet != your bet and (your turn or a bet exists). Raise enabled on your turn if you are not in the no-reraise list (`cRPI`) and stack > highest bet. Fold enabled unless all-in. FOLD when a check is free does not fold: it asks `Are you sure that you want do an unnecessary fold?` (typo verbatim) with small `Do not show this again in this session?` checkbox (session-global flag).
- `Your Turn` signal: yellow `#ff0` uppercase bold .7rem text above buttons (`top -1.2rem; right 1rem`) + yellow dot (.85rem, glow #ebff78): `blinker .2s` x5 after 2 s delay, then `blinker 1.5s infinite` after 3 s (phone: `YOUR TURN` bold yellow right-aligned x301-381, y~654, 79.8x14, class `action-signal`). `beep` plays when your turn starts (once per turn, only if no pre-action is stored).
- Extra time: button `Activate Extra Time (<n>s)` (n = floor(bank ms/1000)) -> `Extra Time Activated` once active (`dLTWTB != dLTWoTB && sNAA == dLTWTB`); hotkey `t`; position `.time-bank` bottom 4.1rem (5.1rem on the bet screen); phone font .32rem. Shown when time bank exists and your bank > 0. Pref `Auto activate your extra time?` (default Yes) auto-sends the activation when your turn starts, you have bank, and no queued action.
- `iamback` button for away (5.1 above).

### 6.2 Pre-actions (intended actions) [JS]
- Buttons never send directly: `updateIntendedAction{kind: FOLD|CHECK|CALL|RAISE|CHECK_OR_FOLD, value}`. If it is your turn and the game is not paused: send at once. Else store `{kind, forGameTurn: street, forHand: handNumber, forCurrentHigherBet: highestBet}`, highlight the button; pressing again clears it.
- When not your turn the same buttons toggle a queued action: Check, Fold, Call, plus `Check or Fold` (hotkey `i`; `.suspended-action`: desktop `right 0; bottom 4.1rem; height 2.2rem`; phone white-outline pill 125.8 wide above right) shown when you are not to act, not all-in, and (no bet or you have the option).
- Stored intent is dropped when the hand number or street changed, or (check/call) when the highest bet changed. `CHECK_OR_FOLD` becomes FOLD if someone bets (highest bet truthy and you are not in the BB-option list); on your turn it is sent as CHECK when free. On every frame while it is your turn the stored intent is sent.
- Observed off-turn rows: `CHECK OR FOLD` pill + `BET`(disabled) `CHECK` `FOLD`, or `CALL 10` / `RAISE`(disabled) / `CHECK`(disabled) / `FOLD`.

### 6.3 Bet panel (Raise/Bet click; `Esc`/Back return)
- Desktop `.raise-controller-form` 40rem x 4.7rem z 25. Left `.raise-bet-value` 9em: label `Your bet` (+ ` (BB)` in BB mode), centred text input 1.8em bold white on rgba(255,255,255,.04), border .05rem rgba(255,255,255,.1), yellow converted tag top-right (`12.5BB`, `.bb-value`, #fff083, .5rem); invalid -> panel bg #d02323. Input focused+selected on open (desktop). Digits only (cents mode decimal-aware; BB mode input in BB with 2 decimals, bet = `floor(bb*bigBlind)`).
- Middle `.raise-controller` 20em x 4.7rem bg #2f2f2f radius .5em: five presets (`.default-bet-button`, 19% wide, 2rem tall, .5rem, letter-spacing .05rem, border .05rem #4f4f4f): `Min Raise`, `1/2 Pot`, `3/4 Pot`, `Pot`, `All In` (opening bet first label equivalent of `Min Raise`: UNVERIFIED U-B1). Slider row (bg #3a3a3a, 2.3rem): `-` `.control-button.decrease` 2rem, native range `input.slider-control` (15rem wide, track #585858 .3rem, thumb 1rem round #ffbb1f, min 0, max = max allowed, step 1; `-`/`+` step by ONE BIG BLIND), `+` `.control-button.increase`.
- Right: green submit `<input type=submit class="button-1 action-button green highlighted bet" value="Raise|Bet|Call">` (`Raise` if value > highest bet, `Call` if ==, `Bet` if no bet) and gray `Back` (`.back`, badge `esc`). Enter submits.
- Preset values: P = pot + sum of numeric current-street bets (your own replaced by highest bet H; H = 0 if none): Min Raise = min(minRaise, stack); 1/2 Pot = H + P/2; 3/4 Pot = H + 3P/4; Pot = H + P; All In = stack; all clamped to stack.
- Validity: value in the precise list (H if any; stack if stack <= (H||BB); else H||BB; plus stack if minRaise >= stack) OR minRaise <= v <= maxAllowed (= min(stack, `mAVTB` effective cap vs opponents)). Initial value: minRaise (stack if short; BB when opening). Confirm: v > H -> RAISE with raise-to value; else CALL.
- Phone (scaled transforms): `.raise-controller-form{left:0; right:0; bottom:0; width:initial; transform-origin:100% 100%}` confirm/cancel `.action-buttons` `width:5.4rem; bottom:.1rem`; `.raise-controller{transform:scale(.62); width:18rem; transform-origin:0 100%; position:absolute; bottom:0; left:0}`; `.raise-bet-value{transform:scale(.65); transform-origin:0 0; position:absolute; left:0; top:-1.4rem; box-shadow 0 0 3rem rgba(0,0,0,.31)}`; slider `width 10.4rem; left 3.7rem`; thumb 1.6x1.6rem; `-/+` width 3.5rem bg #434343 2.3rem tall glyph 1.2rem. Measured @390: form 4.5,658.4,381x105.6; bet card 4.5,627,131.4x68.6 (input font 40.4px 126x34.5); panel 4.5,698.6,250.7x65.5; presets 46.6x27.9 gap 2.7px at y=701.3 (x 7.3,56.6,106,155.3,204.7); slider row y=733.4, track 144.8x4.2 at x=57.3,y=747.1; `-` 48.7x32; BACK (grey) 58.4x51.7 at (264.2,710.1); green RAISE x~330..385; 360 wide panel 231.4x60.4 at (4.1,625.3); 430 wide 276.4x72.2 at (5,770.9).

### 6.4 Hotkeys (desktop only; ignored on mobile UA and whenever a modal/popover/chat input/other screen is open; `skipGlobalLock` for `+`)
`k` check, `c` call, `r` bet/raise (opens panel), `f` fold, `i` check-or-fold, `t` activate extra time, `Enter` Next Hand (owner) / submit chat/bet form, `m` open chat, `l` open log, `b` toggle BB display (posts local auto chat `You are now seeing the values as big blinds, to toggle it, press b`; remembers previous style), `s` show all cards, `1`/`2` show individual card, `p` pause/unpause (owner), `h` rabbit reveal, `+` add blind level (config form), `Esc` closes modal/panel/alert/chat (document keydown keyCode 27). Voice hotkeys `u`,`v` omitted. CSS badge `y` (call any) exists but unused: not implemented.

---
## 7. Animations and timings (02 s17, B3; 05 s4-7; 07 s1-3)

### 7.1 CSS animation inventory (nothing else animates)
| What | Spec |
|---|---|
| Your-turn plate glow | `glow-current .4s forwards` (landscape white 2.1em; portrait lavender 3em) |
| Winner glow | `glow-grow 1s`; `glow-decrease 1s` delay 1s; `glow-pulse 2s` delay 2s (total 4 s) |
| Winning cards raise | `.5s` transition (default ease) `top` |
| Hole cards fade/hide | `.5s`; own dim `.3s` |
| Board card flip | `.15s` rotateY, 150 ms stagger (4.8) |
| Dealer button move | `.5s` all |
| Pot add-on pill, table glow | `.5s` opacity |
| Your-Turn dot | `blinker .2s` x5 @2s delay; `1.5s infinite` @3s delay |
| Blurred placeholder on New Game | `.8s linear` opacity/visibility |
| Winner stack pill | appears instantly |
| Time bar | widths recomputed every 100 ms (no CSS transition) |
Absent (do NOT add): card-dealing flight, chip flight to pot, pot-to-winner movement, showdown flip of opponents' hole cards (state/opacity change; values arrive with `showing:true` and `up` class), timer ring. No animation engine; all = React re-render + CSS transitions keyed on class changes.

### 7.2 Hand flow timings [OBS unless noted]
| Event | Time |
|---|---|
| Gap between an action and the next player's `decision-current` | 802, 830, 888, 893 ms (server `sNAA = now + 800`) |
| Frames after an action | (a) result; (b) +0.8 s next actor; (c) +0.28 s tiny frame correcting deadline to include bank |
| Fold effect | cards removed + `hide-cards` + status `FOLD` in the same tick; fade .5 s |
| Everyone folds -> award | 788-798 ms after the last fold |
| Award tick (single tick) | pot -> `0`, `total` pill gone, all bet pills removed, `+gain` pill on winner stack, winner plate class `winner`, ghost board + REVEAL bar (rabbit on), winner glow 4 s |
| Fold-win award -> next hand deal | 3004-3005 ms (`NSAGR` = 3000) |
| Showdown (no all-in run-out) award applied | 0.85 s after last check |
| Showdown award -> next hand | 6.04 s at Normal; setting Fast 3 s / Normal 6 s / Slow 9 s (code constant `NSAGRS` 8 s is overridden by the setting; U-T4) |
| New hand tick | hole cards dealt (all in one tick, no stagger), bets posted (10/20/40 in one tick), dealer/straddle discs slide 0.5 s, first `decision-current` set ~simultaneously |
| Board between streets in normal play | action-time driven; flop 3 cards in one tick, flips 150 ms apart |
| All-in reveal (`NSAAD`) | 4 s |
| RIT vote window (`NSARD`) | 10 s; display `(9s)` first |
| Run-out street spacing | 4.000 s (flop +4.0 s after reveal; turn +4.06; river +4.08; run 2 flop +3.96 after run-1 river; turn +4.01; river +3.99); each card flips 154 ms after insertion; equity pills recomputed at the instant a street is inserted |
| After last run-out card -> award | 3.9 s (3.92 s observed single run) |
| Run-out award -> next hand | 8.07 s |
| Rabbit reveal window | until the next hand starts (~8-10 s auto start); a click adds ~3 s (`sNAA += ~3000`) |
| Chat bubble | 7.2 s (4.5) |
| Chat panel row highlight | 800 ms |
| Idle keep-alive frame | every 4-20 s |

### 7.3 Turn timer bar [CSS+JS+OBS]
`.time-to-talk` at the bottom edge of the plate: desktop `height .2rem; width 54.5%; right 0; bottom 0; bg #efefef; flex` (4/5-card hands 63%); phone `width 5rem; height .15rem; left 0`. Two segments: `.time-bank` purple `#9972cb` (left) and `.normal-time` green `#b1d85d`. Re-rendered every 100 ms from the server-synced clock. Math: `total = dLTWTB - pASA - offlineAdj`; `bank = dLTWTB - dLTWoTB`; `regular = total - bank`; `elapsed = serverNow - pASA - offlineAdj`; regular consumed% = `min(elapsed, regular)/regular*100`; bank consumed% = `(elapsed>regular ? elapsed-regular : 0)/bank*100`; widths = remaining share. Both bars get class `red` and `warning-beep` plays (own seat only) once consumed > 70%. Initial segments e.g. 20 s + 1 s bank -> bank 4.76% / normal 95.2%. At the limit the bank segment shrinks; the server acts at limit + bank (observed 21.04, 20.97, 21.01, 21.04 s for a 20 s/1 s table). Disconnected actor: `offlineTimeBankLimit` bar `time-bank normal-time` from `max(pASA, disconnectedSince)` to the limit, drawn green (length UNKNOWN U-T6). Pause: `uP` freezes countdowns (uses uP as "now").
Server clock sync: every frame carries server wall clock `sN`; `diff = Date.now() - sN` (latest wins); `getServerNow() = Date.now() - diff`; no RTT compensation. All countdowns derive from absolute deadlines (`sNAA`, `dLTWoTB`, `dLTWTB`). Countdown text `mm:ss` floor zero-padded, `00:00` when <= 0. Show-hand buttons stay until `sNAA - 600`.

---
## 8. Roles and owner controls (04 s1, s5)

| Role | Determination | Abilities |
|---|---|---|
| Owner/host | `isOwner`; creator; transferable | Players menu/tab; edit Game settings; approve/deny seats; Pause; Stop; Next Hand; Start Game; Shuffle Seats; edit/remove players; put away; transfer owner; toggle spectator. Red badge on OPTIONS = pending requests |
| Seated player | status `inGame` / `standingUp` | Away / I'm Back; Leave Seat; own preferences; can open Game Configurations read-only |
| Guest/watcher | status `watching`; name `Guest` until named | Request a seat; chat unless owner disabled guest chat (everyone who has been at the table counts as "guest" for that setting) |
| Spectator ("god mode") | owner grants per player when Spectator Mode = Yes | sees seated players' hole cards while unseated (13.4) |

- Non-owner Game screen: banner `Warning: only the room owner can change these settings.`, all inputs disabled, no submit bar. Anyone connected can view Options > Game. Players tab and Update button owner only.
- Owner cannot Remove/Away themselves (buttons hidden when target is self) and cannot transfer to self.
- Start Game: owner only, status `waiting`, >1 players inGame. `POST /games/{id}/start-game`.
- Shuffle Seats (`RS`): same condition; randomises seat assignment before start (crypto Fisher-Yates among seated players; whether seat numbers or positions are permuted: U-G1).
- Pause: round dark-gray button `Toggle Pause`, tooltip `Pause the Game`, hotkey `p`, owner only and only while a hand is in progress; actions `UP`/`UR`; centre text `The room owner paused the game.`; button icon becomes a play triangle; offline players show `FOLD (OFFLINE)` / `OFFLINE` chips. Countdowns freeze (`uP`); server-side timeout behaviour under pause U-T7.
- Stop: small button `Stop`, tooltip `Stop Game on Next Hand` (after click tooltip `Cancel Game Stop`, button red). Confirm `You are about to stop the game. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven.` with CANCEL / CONFIRM (02: confirm button text `Stop Game on Next Hand`). Owner only, only while a hand runs. Action `TSG {decision}`. Log: `The admin yash enqueued the game stop on next hand.`; at hand end for each away player `The player X stand up with the stack of N.` then `-- ending hand #N --`. After stop status = waiting; Start Game / Shuffle Seats reappear. Hand numbers continue across a stop. Hard stop: dealer random on restart; missed blinds forgiven.
- Next Hand: `Next Hand »` (Enter) when Auto start = No; non-owners see `Waiting for the owner to deal the next hand.`
- Leave Seat: top-left button; dialog `Are you sure that you want to leave your seat?` / `You will enter in check/fold mode until the hand's end.` CANCEL (red) / CONFIRM (green); armed button highlighted, click again cancels (`CQNH`). Before a hand starts the seat is freed immediately. Mid-hand: status `QUITTING`, auto fold on turn (`Bob folds`), posted blinds stay, at hand end log `The player Bob quits the game with a stack of 870.` and the seat empties.
- Away button (seated, in game, not pending): `SUNH`; becomes `I'm Back`. Away mid-hand = auto check/fold on turn (still reaches showdown if checked down and shows). At hand end (Deal hands to away players = No): log `The player Dave stand up with the stack of 4000.`; skipped next hand. `I'M BACK` -> `IN NEXT HAND`, then log `The player Dave joined the game with a stack of 4000.`. `PLAYER_SIT_BACK` with stack 0: alert `You can't sit back without chips. Please add chips or request the game host to add chips for you.` (`Return on Big Blind` does not exist outside Lounge).
- Spectator warning modal (non-owner, new spectators granted): `WARNING: new players allowed to be spectators (see hole cards) when unseated! Players: <names>` + button `Ok, I am Aware!`.
- Disconnect: banner (4.1). Server presence `disconnectedSince` shown to others as `(Offline)`.

### 8.6 Rebuy (Allow Rebuy = Yes) [JS; never observed live: U-R1]
Busted player gets popup `Would you like to Rebuy?` with `Available values:` hint, field `Intended Stack`, buttons `Cancel` / `Confirm`, line `<n> seconds to take the decision`; others see `Waiting for busted players to make rebuy decision. (<n> seconds)`; owner then gets dialog `The player "<name>" requested a rebuy.` with `Approved Stack` input (prefilled), line `Requested stack: <n>`, buttons `Cancel` / `Approve`; others see `Waiting for the owner to approve/deny the pending rebuys. (<n> seconds)` (sNA `FOAR`). Errors: `Was not possible to request the rebuy. Please try again.` / `Was not possible to resolve this rebuy request, please try again in some minutes.` Timer lengths UNKNOWN (placeholders). With Allow Rebuy = No busted players are removed automatically and must re-request a seat.

---
## 9. Options menu, Players, navigation (04 s2-4)

### 9.1 Options popover `.popover-1.top-controls-options-popover`
Button `.top-buttons-button.options` (label OPTIONS under hamburger icon; red numeric badge for owner = pending requests). Opens to the right on desktop (`left 115%` of the column, padding .7rem; buttons 211x33, step 36 from y152 @1300), downward on phone. Items in order: `Home` (gray; navigates `/home`), `Game Configurations` (all roles), `Players` (owner only; bubble with pending count), `Preferences`. (Account row, Schedule next game, Video/Audio, Save Current Hand omitted.) Tap outside closes.

### 9.2 Config screen (full screen over the table)
Top tabs: `« Back` (returns to table), `Players` (owner only), `Game`, `Preferences`. Tab: Mulish 23.4px/700 white uppercase, radius 7.02px top corners, height 80, y 53 @1300; active bg rgb(144,151,102) (olive) with a 12px olive rule under the bar. `.choose-buttons`: 1.5px solid #979797 border, radius 7.02px; buttons 18.72px uppercase; inactive text #666; active bg #383838 white text; height 44-47. Number inputs: text, `inputMode=numeric`, digits only (non-digits stripped), border 1.5px #979797 radius 7.02 text 19.89px height 49. Help `?` = yellow-on-black 15x24 chip (`.help-signal`).

### 9.3 Players screen (owner)
One card per player ever seen; order: pending requests first (yellow-outlined), then seated, then watchers. Card: name, grey chip `ID: <10-char id>`, status, right-aligned actions. Status strings: `Playing with <stack> stack`; `Waiting next turn to enter`; `Away`; `Requested Ingress (Intended Seat Number: <n>)`; `Player will quit in the Next Turn`; `Watching`. Unnamed = `Guest`. Allowed spectators: small text `Allowed to be Spectator` instead of Deny. Buttons: pending -> green `Approve` (`Approving` while loading) + red `Deny`; others gray `Edit`. Approve opens the edit page (`Player's Stack` + `Approve Player`) per live observation (live beats [JS] one-click). Toasts: `Player successfully approved.`, `Ingress request successfully rejected.`, `Whoops, something goes wrong.`; load error `Something wrong happened when loading the game's players.`

### 9.4 Edit player screen
Header `<name> (ID: <id>)`. Seated/away: fieldset `PLAYER STACK` with `CURRENT <stack>`, segmented `ADD` (default) / `REMOVE` / `SET`, number input placeholder `Value`, green button; approving: single input `Player's Stack` (placeholder `Stack`). Button label: `Update Player` / `Approve Player` when table waiting or player standing up; otherwise `Update on Next Hand` / `Approve on Next Hand`; `Loading…`. Toasts: `The player will be updated on next hand.` / `Player successfully updated!`. Right column red buttons: `Remove Player` (not me, seated/away; confirm `Are you sure that you want to remove this player from their seat?`; toasts `The Player will be removed on next hand.` / `Player successfully removed.`); `Transfer Game Ownership` (any other player incl. watchers; confirm `Are you sure that you want transfer the game ownership?`; toast `Game ownership successfully transferred.`); `Allow Spectator Mode` / `Disallow Sepectator Mode` (sic; only when Spectator Mode on; confirm `Are you sure that you want to allow this player to see the hole cards when not seated?`); `Put on Away Mode` (seated in game, not me; confirm `Are you sure that you want to put this player in away mode?`; toast `The player entered in away mode.` when not waiting). Errors `Whoops, something wrong happened…`. No ban: Remove only unseats; re-request assumed possible (U-P1). Owner stack change while game stopped applies immediately (log `The admin updated the player Bob stack from 60 to 100.`); during a hand it queues to next hand.

---
## 10. Game settings: "Game" tab (04 s3, 06 s2, 07 s8)

Layout: two columns; left Blind Levels; right the settings below in order. Fixed bottom bar: `Custom Presets` (gray, landscape only, 260x75 at x21 @1300) and green submit (220x75). Submit label `Update Game` if status `waiting` else `Update on Next Hand`. Banner `These settings are waiting the next hand to be defined.` when a queued change exists. Submit POSTs the full config to `/games/{id}/update_game`; waiting -> alert `Game successfully updated.`; else `New configs successfully enqueued. The game will be updated on the next hand.`; 422 -> alert `Something doesn't look right with your game configurations, please check the errors on the form.` + per-field errors (wording UNKNOWN U-G2). Loading `Loading, please wait...`; fetch failure `Something wrong happened when fetching the game configs.` A log block `Game Config Changes` lists changes (15.2).

| # | Label (verbatim) | Type / options | Default | Notes |
|---|---|---|---|---|
| 1 | `Blind Levels` | table | 1 level: SB 10, BB 20, Duration `∞` (disabled) | 10.1 |
| 2 | `Antes?` | Yes/No | No | adds `Ante` column; effect/log UNKNOWN U-G5 |
| 3 | `Poker Variant` | select with one option `No Limit Texas Hold'em` (value `th`) | th | [ARCH single option] |
| 4 | `Use cents values?` | Yes/No | No | disabled once the game exists |
| 5 | `Allow players to see the undealt cards? (Rabbit Hunting)` | Yes/No | No | next hand; `?` popover text UNKNOWN |
| 6 | `Allow Run it Twice?` | `Always` / `Ask Players` / `No` | No | log `Allow Run it Twice: no » ask players` |
| 7 | `Allow UTG Straddle 2BB?` | Yes/No | No | |
| 8 | `Auto start the next hand?` | Yes/No | Yes | No => owner `Next Hand »` |
| 9 | `Showdown Presentation Time` | `Fast (3s)` / `Normal (6s)` / `Slow (9s)` | Normal (6s) | |
| 10 | `Deal hands to away players?` | Yes/No | No | |
| 11 | `Decision Time Limit (seconds) (blank to no limit)` | integer | 20 | clearing also clears bank + refill |
| 12 | `Time Bank Length (seconds) (blank to no time bank)` | integer | 10 | disabled w/o limit |
| 13 | `Number of played hands to fill time bank` | integer | 10 | disabled w/o bank |
| 14 | `Reveal all hands when no more action is possible?` | Yes/No | Yes | |
| 15 | `Spectator Mode` | Yes/No | No | `?` popover text UNKNOWN U-G4 |
| 16 | `Allow Rebuy?` | Yes/No, popover `When enabled, busted players can immediately request a rebuy with a new stack value. The game owner must approve or reject each request.` | No | |
| 17 | `Allow guests to send chat messages?` | Yes/No, help `Every player that has been in the table is considered as "guest"` | Yes | |
| 18 | `Record table chat for Hand Replayer?` | Yes/No, popover `When enabled, table chat messages are saved with each hand and may appear in Hand Replayer and shared replays.` | Yes | on => red recording dot in chat input |
| 19 | `Auto trim excess bets?` | Yes/No, popover `When enabled, raises that exceed the maximum allowed bet based on the enemies stacks are trimmed down to the highest valid amount.` | No | |
Omitted: Theme Design, Bomb pot, Double Board, 7-2 Bounty, Nit Game, Simulated Fee, Variant Rotation. Not present for private tables: max players (always 10), min/max buy-in, ban list.
Effects: Spectator Mode = Yes -> alert `You will need to grant spectator mode to individual players, which you can do in their Edit screen in the Players menu above.`; set to No while game running and it was on -> confirm `Warning: you will only be able to activate it again when the game stops and no player is seated.` Spectator Mode can be turned on only while nobody is seated.
Timing for all: submit while a hand runs is queued and applied at the start of the next hand; while waiting applies immediately.

### 10.1 Blind levels table
Columns: level number, `SB`, `BB`, `Ante` (only when Antes = Yes), `Duration (Min)`. Inputs maxLength 6, digits only, placeholders `SB`, `BB`, `Ante`, `Duration`. Last row duration shows `∞` disabled unless a duration is typed. Rows after the first have an `X` remove button. Full-width gray (#4e4e4e) 14.04px bold uppercase button `Add Another Level (or Press "+")`; hotkey `+` adds a level and focuses the penultimate duration field. Removing down to one level deletes its ante cell.
With >1 level and a game running: select `Countdown mode` options `Only start next blind countdown in the hand's beginning` (value s) / `Never stop the countdown` (value c); select `Restart blind clock at the level` options `Choose the Level` + `level 1..N`; error `You need to choose a blind reset level.` Structure edits while running lock the section (7% opacity) with `You need pause the game in order to change the blind structure.` + button `Ok, I want pause the game now`. Limits for blinds/ante/duration UNKNOWN U-G3.

### 10.4 Custom presets (landscape only)
`Custom Presets` popover: row `Save current setup`, input placeholder `Preset Name` (maxLength 15), button `Save`; empty state `You can create presets to reuse your game configurations in other games.` Rows: name, `Apply`, `X`. Max 5: `You reached the max limit of 5 presets.`; empty name `You must define the preset name.`; duplicate `There's a preset with same name.` Stored in localStorage `presets` (per device). Apply ignores blinds/countdown when structure is locked and never changes cents mode when locked.

---
## 11. Rules engine (06; [STD] where marked)

### 11.1 Table lifecycle
Seats 1-10; >= 2 players inGame; owner presses Start Game (`waiting` -> `inProgress`); hand numbers `#n` increase for the table lifetime. New seat enters at the next hand (`IN NEXT HAND`). Busted (stack 0 at hand end, Rebuy off): removed, log `The player Carol quits the game with a stack of 0.` (logged BEFORE the next `-- starting hand`). With 1 player left: `Waiting for others` (status waiting).
A newcomer who is UTG at his first hand owes no blind (observed); other newcomer cases U-D3.

### 11.2 Button, blinds, order
- Button moves one occupied seat clockwise per hand. If the seat that should hold the button is empty: header `-- starting hand #9 (id: ...)  No Limit Texas Hold'em (dead button) --` instead of `(dealer: Name)`; SB = next occupied seat after the button, BB next. `Dead Small Blind` log line (no amount) when the SB seat holds an away/stood-up player (only BB posts). Returning (away) player owes a missing blind: `Dave posts a missing small blind of 10` (missing big blind wording `posts a missing big blind of N` from replayer hints, U-D1).
- Blinds posted SB then BB, logged `X posts a small blind of N` / `X posts a big blind of N`. A completed SB logs `Dave calls 20`.
- Heads-up: dealer = SB (posts 10, acts first preflop when no straddle); non-dealer = BB acts FIRST postflop (and first preflop only with a straddle).
- 4-handed example: dealer Carol(3): SB Dave(4), BB yash(1), first to act Bob(2), BB option `yash checks`; postflop first to act = SB. 3-handed: dealer is UTG preflop.
- Straddle (if `Allow UTG Straddle 2BB?` on AND the UTG player's pref `Auto Straddle 2 Big Blinds when UTG?` on, server action `SSP`): UTG posts 2xBB `X posts a straddle of 40` after the BB line (order SB, BB, straddle); stack drops by 40; preflop action starts left of the straddler; straddler acts LAST with check/raise option; others `CALL 40`, SB `CALL 30`, BB `CALL 20`. Min raise-to after straddle = straddle + last raise size (40+20 = 60); later min re-raise = previous increment (Carol raised to 60 -> Dave MIN RAISE 80). Heads-up with straddle: `yash posts a small blind of 10`, `Dave posts a big blind of 20`, `yash posts a straddle of 40`; Dave acts first preflop (`CALL 20` completes to 40), `Dave calls 40`, `yash checks`. Straddle with UTG stack < 40 / multiple straddles / straddler pref off with table on: U-D2. Live straddle disc `S`.
- Antes: effect UNKNOWN U-G5 (replayer hint `posts ante`).

### 11.3 Betting [STD + observed]
- Min raise-to = highest bet + size of the last full raise (initially BB); min bet = BB; a raise below the minimum only as all-in. Preflop min open raise = 2BB (40).
- A short all-in that is not a full raise does not reopen betting: players who already acted are in the no-reraise set `cRPI` and their Raise is disabled (client logic; never engineered live: U-D4).
- Log amounts `calls N` / `raises to N` / `bets N` = player's TOTAL bet this street; suffix ` and go all in` when the stack is exhausted (`Carol raises to 960 and go all in`, `Dave calls 960 and go all in`, `yash calls 120 and go all in`, `Bob raises to 1000 and go all in`).
- `mAVTB` = effective-stack cap vs opponents; with `Auto trim excess bets?` over-max raises are trimmed; uncalled excess is always returned: `Uncalled bet of 120 returned to Carol` then `Carol collected 240 from pot` (no hand description when all fold); partial raise `Uncalled bet of 135 returned to Dave`; all-in excess returned before the RIT prompt (`Uncalled bet of 590 returned to Carol`).
- FOLD when CHECK is free does not fold (confirm modal; if confirmation disabled it is a check: `Dave checks`).
- Timeout: limit then bank; at expiry auto FOLD if facing a bet else CHECK; log plain `Bob folds` / `Dave checks`. Pref-driven bank auto-activation (button `EXTRA TIME ACTIVATED`). Bank per-player `pTB` ms; observed drop 10000 -> 1101; refill over N hands: math UNKNOWN U-T5.
- `directToNexTurn` = all remaining all-in (or one left with chips): run-out mode (13).

### 11.4 Pots [STD + observed]
Main/side pots by contribution levels (120/1000/1000 -> main 360, side 1760). Display: centre = pot from previous streets; `total N` includes current bets. Award lines per pot per run: `Name collected N from pot with <Hand> (combination: <5 cards>)` (fold wins: `Name collected N from pot`). Run 1 lines then run 2 lines. Odd chip U-D5 (placeholder `ODD_CHIP_RULE`). Burn cards invisible; PokerThen's deal mapping is in 20.3.

### 11.5 Hand evaluation [STD]
Best five of seven; Royal Flush, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, Pair, High Card; wheel A-5 = 5 high; ties split.

---
## 12. Showdown, results, hand names (06, 07)

### 12.1 Reveal order [OBS]
- Action remaining: sequential from the first active player left of the dealer (last-aggressor rule [STD], U-D6); a player who cannot beat the best shown hand mucks silently (no log, never shown). Observed: Dave (first left of dealer) shows, yash (winner) shows, Carol (loser last) mucked. Dead-button hand: Carol (first left of dead button), Dave, yash (winner) showed; Eve (losing last) mucked.
- All-in with `Reveal all hands when no more action is possible?` = Yes: hole cards of all non-folded players flip face up when the RIT decision starts (before the board runs); log lines `yash shows a 6♥, 8♦.` in SEAT NUMBER order (observed: yash, Carol, Dave; yash, Bob, Dave) BEFORE the flop line. Setting = No: U-D7.
- Folded players' cards never shown automatically. Voluntary show: 12.3.
- At showdown the server pushes values `showing:true` to all clients at once with `name1`/`name2`; revealed hole cards and winning board cards get `up`; non-winning board cards `semi-hide`; winner plate `winner`.

### 12.2 Hand names
- Log text: `Straight, 9 High`, `Two Pair, 5's & 2's`, `Two Pair, A's & 7's`, `Pair, A's`, `Pair, K's`, `Flush, J High`; second run: `Pair, A's on the second run  (combination: 8♣, 9♥, 10♠, A♣, A♠)` (two spaces before `(combination`). Combination = five cards low to high with pair kickers grouped (`10♣, 2♣, 2♠, 5♠, 5♣`; `5♦, 6♣, 7♠, 8♦, 9♠`).
- Seat chip server strings (rendered uppercase): `high card`, `pair (6)`, `pair (A)`, `two pair (7,4)`, `two pair (A,7)`, `straight`, `flush`, `three of a kind`; rabbit `(RH: PAIR (K))`. Texts for Full House / Four of a Kind / Straight Flush / Royal Flush chips and Three of a Kind / Full House / Four of a Kind / High Card / Straight Flush / Royal Flush log forms: UNKNOWN U-D8 (placeholders follow the observed pattern: `Three of a Kind, 5's`, `Full House, 5's over 2's`, `Four of a Kind, 5's`, `Straight Flush, 9 High`, `Royal Flush`, `High Card, A`).
- Chip is sent only for players whose cards are showing, and for yourself live from the flop on. Winner gets `+gain` pill; `winCount` increments.

### 12.3 Show cards after hand
`.show-hand-buttons`: green `Show All Cards` (`s`) + one toggle per hole card with rank+suit text (`1`,`2`); action `SHOW_HAND {cardToShow: "all" | "8h"}`. Shown to a player who has cards, when hand is at result, or all-in/in-game with run-out, status inGame, no pending RIT decision (hidden while RIT pending); ends at `sNAA - 600` ms when auto-deal is on. Desktop 213.4x109.7 at (1208.5,732.4) two rows; phone single row `SHOW ALL CARDS | 4♥ | 4♠` 235.1x47.9 at (150.4,716.1), height 2rem, border #139249, `--show-hand-button` 1rem desktop / .7rem phone. A voluntary show flips those cards to showing for everyone on the next frame; log `X shows a ...`. Phone at result: `I'M BACK` (green) left + segmented `SHOW ALL CARDS | 7♣ | 9♠` right x~280..385. After a fold-ended hand every seated player (winner too) can show.

---
## 13. Run it twice and equity (05 s8.6, 06, 07)

### 13.1 Setting and trigger
`Allow Run it Twice?` = `Always` / `Ask Players` / `No` (internal `always|ask_players|no`). Triggered when no more betting is possible and the board is incomplete (even preflop; after the flop only turn+river twice [DOC]); only NLHE. Players still in the hand (inGame/allIn; folded not prompted). `Always`: no prompt, run twice; log/timing U-RIT1.

### 13.2 Prompt and votes
- `.rit-container` in the action-bar slot: `Run it Twice?` + `Yes` (green rgb(57,175,107)) / `No` (red rgb(252,65,23)); desktop 201x91.3 at (1220.9,750.7), border 2px white, radius 7.78px, buttons 90.7x51.8 at y=783 (YES x=1228.1, NO x=1324); phone 127.8x77.4 at (257.8,686.6), border 1px white. Chosen button stays; the other fades to opacity .25. Action `DRITD {decision}`; debounce 190 ms. Pref `Run it Twice?` Yes/No auto-answers immediately.
- Centre text `Waiting for run it twice decisions (9s)`. Window 10 s (`NSARD`); expiry = No.
- Result: all YES -> log `All players in hand choose to run it twice.`; any NO -> immediately `Dave chooses to not run it twice.` then `Some players choose to not run it twice.` and a single run (does not wait for others). A YES logs `Bob chooses to  run it twice.` (two spaces after "to"). Intro log `Remaining players decide whether to run it twice.` Unanimity required; timeout = not agreeing.
- Sequence (all YES): last answer +0.38 s prompt removed -> +0.53 s empty `.table-cards.run-2` row + `Show All Cards` group -> +1.33 s hole cards of all-in players flip with equity pills (first `0%`) -> run 1 flop +4.0 s after reveal, turn +4.0, river +4.0 -> run 1 row dims (`semi-hide`, `after-padding`) -> run 2 flop 4.0 s later (3 cards), turn +4.0, river +4.0 -> award +3.9 s -> next hand +8.07 s.
- Pot split: each pot halves per run (360 -> 180/180; side 1760 -> 880/880; main 2640 -> 1320/1320 with side 600 -> 300/300); odd chip U-D5. During the run pot text `total 3830` small label then centre `3240` after uncalled returned.
- Run 2 log: `Flop (second run):  [9♥, 10♠, 4♥]`, `Turn (second run): 9♥, 10♠, 4♥ [5♦]`, `River (second run): 9♥, 10♠, 4♥, 5♦ [8♣]`.
- `gT:[run, stage]` run 1|2, stage 0 preflop, 1 flop, 2 turn, 3 river, 4 showdown, 5 result.

### 13.3 Equity pills [OBS; resolution C2]
Server-computed `prob1` sent only while `directToNexTurn`: first at the reveal frame (stage 0, 4 s `NSAAD`), then each street delta; run 2 re-sent for the current run (also `name2`). Client shows `Math.round(prob1)` as `NN%` only when `gT[1] !== 5` and cards are showing. Pill `P.win-odds.numbers-signal` in `.win-odds-container` (z 5): desktop 49.2x28.5px (1.9x1.1rem), Mulish 700 12.96px (.5rem) white, radius 21.25px (.82rem), shadow `0 0 25.9px 0 rgba(0,0,0,.49)`; leader green `#49A16E`, others red `#AB4343`, before first calc gray `0%`. Position: overlaps the top-right of the hole-card pair (cards' right edge +15px, top aligned with card top). Phone: container `scale(.72)`: 30.7x17.8px, font 11.23px, radius 18.4px. Observed: preflop reveal 0/0/0 then flop 8/56/35; turn 1/6/93; river 0/0/100 (integers sum ~100; colours swap instantly when a street is dealt); final 100% green / 0% red then container removed at award (same tick as `winner`). Run 2 start recalculates. Method/rounding/leader rule: U-Q1, U-Q2 (placeholder `EQUITY_METHOD`).

### 13.4 Spectator ("god mode") [DOC]
Owner grants per player; granted unseated viewers get hole cards of seated players who allowed it (seat form checkbox `Allow unseated players to see my hole cards`); felt turns red; banner `Spectator Mode Activated` `[?]`; counter `<n> seeing the hole cards`. Data flow never observed (U-G4).

---
## 14. Rabbit hunting (06, 07 s5)
Setting `Allow players to see the undealt cards? (Rabbit Hunting)` (next hand). When a hand ends before the river: missing board slots drawn as face-down dimmed backs (`.card-container.big.hide.semi-hide`) in the normal board position for EVERY seated viewer (winner and folded too), with one full-width dark bar `.reveal-button` over the vertical middle of the missing slots: bg `#232B27`, white bold `REVEAL` text centred with a small eye icon at the left, radius 5.18px; desktop hotkey badge `H` at its right end (none on phone); desktop 640.5x33.7 at (396.5,337.5) for 5 slots (board row 627 wide at x=403,y=283.1; bar = row +13px; font 14.26px); phone 299.7x15.8 at (46.3,376.1), font 12.36px radius 4.49px. Width formula `4.61*n + .29*(n-1) + .5` rem. Appears at the award tick and stays until the next hand deals. Partial board (turn/river only missing): bar spans those slots (not re-verified, U-RH1).
Click `RUC` (viewer only): bar removed; real cards replace backs (`semi-hide` kept: translucent, faces dimmed 50%) and flip face-up one by one 152 ms apart left to right (first +152 ms after click); centre text `Some players are seeing the undealt cards.` (`.rh-message`, white 50%, bold, centred under the board; shown to everyone while any requester exists); requester's hole-card label becomes red chip `(RH: PAIR (J))`; log line (all viewers) `Undealt cards:  [A♥, 9♠, 4♠, 3♥, J♦]` (two spaces). Others' boards unchanged (they keep backs + their own REVEAL bar). Server: reveal is recipient-specific (`rHC` only to requesters); `rHP` lists requesters; next hand delayed ~3 s on click; next-hand frame clears `rHP`/`rHC`. In-hand rabbit after run-it-twice: not applicable.

---
## 15. Log and Ledger (02 s12, 04 s7, 05 s2, 06, 07)

### 15.1 Log / Ledger modal
- Entry: bottom-left button `Log / Ledger` (landscape) / `Log` (portrait); hotkey `l`; long-press (500 ms) opens Ledger directly. Modal `.log-modal` titles: `Session Log`, `Session Ledger` (Game Replayer / Cash-in/Cash-Out Log titles unused). `Close` button (X on phone). Bottom tab row: `Full Log`, `Ledger` (active tab filled green; `Replayer` tab omitted: replayer is out of scope). Bottom actions: pagination `« Hand #<n+1>` and `Hand #<n-1> »` (shown on Full Log; LIVE `HAND #3 »`), and `Download` (CSV). Download: no captcha in PokerThen (reference text `In order to download, please solve the captcha. Important: the log file is limited to 20,000 lines.` is **omitted**; keep the 20,000-line limit server-side [ARCH]).
- States: `Loading...`, `Empty Log`. Errors: `Too many requests, please try again in some seconds.` (429), `The log access is limited due the high load on servers. Please try again in some minutes.` (503), `Something wrong happened when loading the log.`
- Entries: `HH:MM` (24h, en-US, #7d7c7c) + text, newest first; names `"Name @ id"` -> plain name with `abbr` title `Player ID: <id>`; rows font .65rem (phone), time column 2.3rem. CSS classes by regex: `start-game` (`^-- starting`), `entry-street` (`^(flop:|turn:|river:)`, case-insensitive), `entry-collect` (` collected N from`), `entry-fold` (`folds$`), `entry-raise` (` raises to|bets|big blind of|small blind of N`), `entry-check` (` checks$`), `entry-call` (` calls N`); colours per class UNKNOWN U-V6 (own design).
- Data: HTTP `GET /api/games/:id/log_v3?hand_number=N[&after_at=<createdAt>]` -> array `{createdAt, msg}`; `createdAt` = epoch ms x 100 (client divides by 100); hand 0 returns `[]`; client caches finished hands (max 50) and polls only entries after the last known `createdAt` for the current hand (while log tab open / on new frames). The log is server-rendered TEXT lines (not structured events). "Your hand is 6♥, 8♦" appears only in the owning viewer's log (per-viewer log).

### 15.2 Log line catalogue (verbatim; raw form with `"Name @ id"`; UI shows `Name`)
Per-hand order:
```
The player "yash @ lOCSAx0p23" requested a seat.
The admin approved the player "yash @ lOCSAx0p23" participation with a stack of 1000.
Game Config Changes
* Allow Straddle: off » on
* Nit Minimum Players: off » 3            (Nit field omitted in PokerThen)
* Allow Rebuy: off » off
* Rabbit Hunt: off » on
* Allow Run it Twice: no » ask players
-- starting hand #1 (id: jxmorahjxvqp)  No Limit Texas Hold'em (dealer: "Carol @ nMe7gmdcCM") --
The player "yash @ lOCSAx0p23" joined the game with a stack of 1000.
Player stacks: #1 "yash @ lOCSAx0p23" (1000) | #2 "Bob @ 2nQAu2OoHX" (1000) | #3 "Carol @ ..." (1000) | #4 "Dave @ ..." (1000)
Your hand is 6♥, 8♦
"Dave @ ..." posts a small blind of 10
"yash @ ..." posts a big blind of 20
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
```
Other verbatim lines: `-- starting hand #9 (id: ...)  No Limit Texas Hold'em (dead button) --`; `"X" posts a straddle of 40`; `Dead Small Blind`; `"Dave" posts a missing small blind of 10`; `"Carol" raises to 960 and go all in`; `"Dave" calls 960 and go all in`; `Uncalled bet of 960 returned to "Bob @ 2nQAu2OoHX"`; `Remaining players decide whether to run it twice.`; `Some players choose to not run it twice.`; `"Bob" chooses to  run it twice.` (two spaces after "to"); `"Dave" chooses to not run it twice.`; `All players in hand choose to run it twice.`; `Flop (second run):  [..]`, `Turn (second run): a, b, c [d]`, `River (second run): a, b, c, d [e]`; `"Dave" collected 180 from pot with Pair, A's on the second run  (combination: 8♣, 9♥, 10♠, A♣, A♠)`; `Undealt cards:  [A♥, 9♠, 4♠, 3♥, J♦]`; `The player "Bob" quits the game with a stack of 0.`; `The player "X" stand up with the stack of N.`; `The admin updated the player Bob stack from 60 to 100.`; `The admin yash enqueued the game stop on next hand.`. Card format: rank then suit glyph (♠♥♦♣), ten = `10`. `Flop:` line has two spaces before `[`; Turn/River show previous board then new card in brackets. A quits/joins line is logged under the hand in progress / next hand; hand #1 contains join + config lines before its `-- starting hand`. `Player stacks:` lists seat number, name, stack for all seated.
Lines not yet observed (UNKNOWN U-LOG1; placeholders in `packages/engine/src/logText.ts`): pause/resume, remove player, away/sit back (beyond stand up/joined), straddle already, ante post, ownership transfer, owner approve with different stack, rebuy approval, owner stack change during a hand.
Config-change block fields (names seen): `Allow Straddle`, `Allow Rebuy`, `Rabbit Hunt`, `Allow Run it Twice`; other fields' names UNKNOWN U-LOG2 (placeholder = the setting label).
Fairness lines (PokerThen addition): see 20.5.

### 15.3 Ledger (all players may open)
Tab `Ledger`, title `Session Ledger`. Header cells `PLAYER`, `BUY-IN`, `BUY-OUT`, `STACK`, `NET` each a link that sorts; active sort arrow `↓` (desc) / `↑`; default Net desc; click same column toggles. Player row: `<name> @ <id>`, button `Details`/`Hide Details`, then In / Out / Stack / Net (net prefixed `+` when positive; classes positive-net/negative-net). Footer `TABLE TOTAL` with sums (In, Out, Stack). Bottom-right green `Download` -> `/games/{id}/ledger_{id}.csv` (fields: nickname, id, session start/end, buy-in, buy-out, stack, net). Details rows per session: label `hand #<start> until #<end|now>` or `Not Started Session`; chips `Took a Seat` / `Left the Seat` / `Add-on` / `Removed` / `Reset Stack` with value; In/Out/Stack/Net. Net = buy-out + current stack (+ escrow) - buy-in; for the playing session `buy_out - (buy_in - inGame - nitEscrow)`. Owner ADD/REMOVE/SET appear as Add-on / Removed / Reset Stack. Disabled message `Sorry, the ledger is not available in this type of game.` (n/a). Example: Dave 1000/0/4000/+3000, Carol 1000/0/0/-1000, TABLE TOTAL 4000/0/4000. Data: `GET /games/:id/players_sessions` -> `{playersInfos:{id:{id,name,buyInSum,buyOutSum,inGame,nitEscrow,net,...}}, buyInTotal, buyOutTotal, inGameTotal, nitEscrowTotal, gameHasRake, rakedValue, rakedValueWaitingToBeCollected}`; `GET .../players_sessions/:pid` -> `[{id,status:"playing"|..., buy_in, buy_out, start_hand_number, finish_hand_number, movements:[{kind:"tookSeat"|"quit"|"addStack", value}]}]`.

---
## 16. Preferences (04 s6, 05 s9, 07 s8)

Per-device, localStorage `currentPlayer` JSON (`version:1`); all apply immediately; only Auto Straddle (`SSP`) is also sent to the server. Defaults object: `sound:"med", deckStyle:"two-color", autoActivateTimeBank:true, showPromotionalAnnouncements:true, showDefaultDesignTheme:true, showQuickAcceptPlayer:true, showSuggestedGesturePopover:true, showVideoVoiceChatWarning:true, version:1`; other keys written there: `displayValueStyle` (`formatted`|`big-blind`|`none`), `nonBBDisplayValueStyle`, `previousDisplayValueStyle`, `showValueAsBB`, `hideGestures`, `hideBadges`, `hideAchivementBadges`, `hideMoodEmojis`, `defaultRunItTwice` (true/false/null), `disableSecondarySounds`, `disableChatMessageBeep`, `notShowHandNotification`.
Preferences tab, order (labels verbatim; segmented buttons):
1. top line `Your User ID: <id>`
2. `Deck Style`: `Four Colors` / `Two Colors` (default Two Colors; sets class `four-color` on `.game-main-container`; in the reference the toggle had no effect for a guest, probably Plus-gated: PokerThen makes it work, free [ARCH])
3. `Auto Straddle 2 Big Blinds when UTG?` Yes/No (default No; dimmed 50% with help `The game owner needs to allow straddle at the game configs.` if the table setting is off; sends `SSP`)
4. `Hide the wins/re-entries count badges?` Yes/No (No)
5. `Hide players' achievement Badges? (Displayed close to the Player name)` Yes/No (No; no-op: no badges besides counts)
6. `Values Display Style` `Big Blinds` / `Formatted` / `None` (None); help `The apparence of the values on the game screen.` + `Tip: you can toggle the Big Blind configuration pressing b key.`; `b` toggles BB mode; BB mode: values suffixed `BB` (`Call 3BB`), toast/auto-chat `You are now seeing the values as big blinds, to toggle it, press b`
7. `Hide Mood Emoji` Yes/No (No)
8. `Disable Secondary Sound Effects? (Fold/Check/Bet/Card)` Yes/No (No)
9. `Disable New Chat Message Beep?` Yes/No (No)
10. `Run it Twice?` `Yes` / `No` / `Ask each Time` (Ask each Time)
11. `Auto activate your extra time?` Yes/No (Yes)
12. `Hide Hand Review Notification?` Yes/No (No; stored, no effect since the popover is omitted)
13. `Gestures Visibility` `Hide` / `Sound Muted` / `Show` -> **omitted** (gestures out of scope) [ARCH]
14. `Show Promotional Content?` -> omitted
15. `Show Seasonal Table Theme?` -> omitted (no seasonal theme)
16. `Show Quick Accept player warning?` `Show` / `Hide` (Show)
17. `Show Suggested Gesture popover?` -> omitted
18. `Show video/voice chat enabled warning?` -> omitted
Sound volume is NOT in Preferences: it is the table-side round `SOUND` button (tooltip `Effects Volume`, 49x49 at (1232,106) @1300; icon only) cycling off -> low -> med -> high -> off, master volumes 0 / 0.15 / 0.45 / 1.0, default med; stored in `currentPlayer.sound`. No animations toggle, themes list, card-back option or hotkey remapping exists. `Mute Guests in the Chat` tournaments only (omitted).

---
## 17. Chat (02 s11, 03 s6, 07 s6)

### 17.1 Desktop
- Box `.chat-container` 22.5x4.4rem (expanded 14rem), bg #2f2f2f, radius .3rem, .7rem, #969696, bottom-left. Message list scrolls; right button `New Message` (2.5rem wide, #383838, bubble icon, badge `m`); expand/collapse chevron (top edge 1.5x1rem at right 3.1rem; measured expanded list x=10..594, y~480..842, 3 rows collapsed). Blank state: `It's a bit quiet here.` + `Click on the balloon and send a Message!`; unread: red `New Messages` tab.
- Message `.chat-message-container` 508x47.2 (27.2 one-line): left column sender name (green for others; grey), balloon #292929 text #dcdcdc .6rem, time `HH:MM` 24h (#7d7c7c) with clock icon; author tab 3.7rem wide #353535. New foreign message: row `highlight` 800 ms (colour rgb(95,95,95) newest) + `chat-beep` (not for own; pref can disable).
- Compose: click `New Message` (or `m`) -> white popover 20rem, single-line input 1.8rem, placeholder `Your Message (press Enter to submit)`, `maxlength 100`, required; Enter sends and closes; Esc/outside closes; error `Something wrong happened. Please try again.`; unsent draft persisted in localStorage `bkp-chatMessage`, cleared on send.
- Table bubble above the player: see 4.5.
- Hover moderation per message: `Report` (omitted) and `Mute` (red). Muted: button `<n> muted` (`.blocked-chat-button`) -> popover list with `Unmute` per player, empty `No players muted`. Mute is stored server-side (`TOGGLE_MUTE_PLAYER` -> `mutedChatPlayersIds`).
- 17.4 Recording dot: when `Record table chat for Hand Replayer?` is Yes a small red dot (`chat-recording-dot`) sits at the right of the input; click shows tooltip `This table chat is being recorded: messages are saved with each hand and may appear in Hand Replayer and shared replays.` (aria-label `This table chat is being recorded`).
- System messages from sender `Poker Now` (profanity filter; PokerThen sender `PokerThen`): `⚠️ Profanity is not allowed. Next offense in the next 10 minutes will result in a 10-minutes block.`; `⚠️ You have been blocked from the chat for 10 minutes due to profanity.`; `... for 24 hours due to profanity.`; `...for <n> minute(s)/hour(s).`. Profanity word list/behaviour UNKNOWN U-C2 (placeholder: filter disabled until the owner supplies rules; keep the message formats).
- Guests blocked when owner turned chat off (UI behaviour UNKNOWN U-C3).
### 17.2 Phone
`Chat` button in the 2-row stack (label `Chat (N)` with unread count N; turns white 800 ms on new message). Tap -> `.chat` visible: full-canvas dark backdrop `.overflow-black` (tap closes) + bottom sheet `.chat-container`: `width:100%; height:15rem; font-size:.7rem; box-shadow:0 0 3rem rgba(0,0,0,.6); padding-bottom:2.6rem; z 101` (17rem when an in-game text banner exists); measured @390: sheet 0,332.7,390x440.3; header strip `.chat-in-game-text` 49px rgb(38,38,38) (omitted content); list `.chat-messages-container` 333px high rgb(47,47,47), rows 381x87; form `.chat-new-message-form` white, `height:auto; bottom:0; z 102`, input row 0,715.7,390x57.3 (input 363x29, font 17.97px, height 1.3rem). After send: input blur and sheet closes. Esc / click-outside close (the reference could not be closed in emulation without the toggle: real gesture UNKNOWN U-C4; PokerThen: backdrop tap closes). New-messages chip `.new-messages-chat{font-size:.6rem; bottom:3.5rem; right:.5rem}`. Auto-message balloon (blue #546eca, max-width 11rem, 3-line clamp, font .45rem, tail left 1.45rem) pops above the Chat button for `2300 + 300*wordCount` ms when a table auto message arrives while closed (system messages only in PokerThen: BB toggle message, profanity warnings); suppressed while deciding.

---
## 18. Sounds and original art

### 18.1 Sounds (names from the reference; PokerThen synthesizes its OWN sounds with the same names/triggers)
Howler-style engine: all muted until a first user gesture unlocks audio by playing a silent `dumb-sound`. Volumes off 0 / low .15 / med .45 / high 1 (default med).
| Name | Trigger | Class |
|---|---|---|
| `two-taps` | check (also BB option check) | secondary |
| `chips` | any numeric bet change (bet/call/raise/blind post) | secondary |
| `fold` | a player folds | secondary |
| `winner` | YOU win (own `isWinner` set) | normal |
| `card-place` | each board card flip (and rabbit flips) | secondary |
| `beep` | your turn starts (once, if no stored pre-action) | normal |
| `warning-beep` | your timer >70% consumed (normal time and again for bank); own seat only | normal |
| `chat-beep` | foreign chat message (not own; pref can disable) | normal |
| `new-player-beep` | owner Options notification count rises | normal |
| `lost` | loaded, unused | -- |
| `dumb-sound` | silent unlock at load | -- |
`Disable Secondary Sound Effects? (Fold/Check/Bet/Card)` mutes the secondary class only. Durations/timbre are original (U-A1: reference durations not measured; W8 chooses short sounds, <= 600 ms each, `winner` <= 1.5 s).

### 18.2 Original artwork list (owner requirement: only artwork unique)
Logo (120x28 tag at table top-left, sidebar logo, favicon.png 60x60, apple-touch-icon 180x180, og image 1200x630), card back pattern (default back; reference is salmon `#CE7474` with white inset border: PokerThen uses its own colour/pattern), suit icon set (own, matching sizes in 4.8), UI icon set (Options hamburger, leave seat, away/stand-up, I'm back chair, sound levels, eye, pause/play, stop, fullscreen, clock, trophy, X-fold, exit-arrow quitting, chat bubble, send, copy, recording dot, house, close X), dealer disc (`D` blue on white) and straddle disc (`S` red on white), dashed seat slot, table felt + rail (desktop horizontal 55.55x26.25rem ratio 2.116:1; phone vertical 17.4x28rem) with red spectator variants, room background texture, blurred new-game placeholder, plate/pill shapes are CSS.
### 18.3 Colours that are ours to choose
Felt/rail/room/card-back colours (reference values listed in section 3 must not be reused for the felt; UI chrome colours elsewhere are copied). Owner's chosen felt: UNKNOWN U-A2 (placeholder: deep blue-teal felt `#1f5b6b` centre / `#17434f` edge, rail `#1c1c1c`).

---
## 19. Copy strings catalogue (verbatim; UI uppercases buttons/tabs by CSS)

Home/create: `Ready to play?`; `START A NEW GAME`; `New Game`; `Play free private online poker with your friends.`; `No download and no registration needed.`; `Your Nickname`; `Create Game`; `Loading...`; `New to poker? `; `Learn the rules in our free interactive tutorial`; `Got it!`; `Connecting...`; `Connection failed!`; (connection failure bodies in 1.3).
Seat/join: `Sit`; `Your Nickname`; `Your Name`; `Intended Stack`; `Your Stack`; `Sit with Away set`; `Allow unseated players to see my hole cards`; `Request the Seat`; `Take the Seat`; `Requesting…`; `You requested this seat. Wait for the owner approval.`; `Cancel Game Ingress Request`; `An error occurred when requesting the seat.`; `Player Name: <msg>`; `Stack: <msg>`; `must be unique and length must be between 2 and 14`; `must be a value between 1 and 1.000.000`; `must be unique on this game`; `The player "<Name>" wants to join the game!`; `do not show this again?`; `Reject`; `Ignore`; `Accept`; `The player was approved successfully!`; `The player was rejected successfully!`; `Was not possible to accept this player, please try again in some minutes.`; `Was not possible to reject this player, please try again in some minutes.`; `Player successfully approved.`; `Ingress request successfully rejected.`; `Whoops, something goes wrong.`; `Requested Ingress (Intended Seat Number: N)`; `Approve`; `Deny`; `Approve Player`; `Player successfully updated!`.
Waiting: `Waiting for others`; `Share this link with your friends!`; `Copy Link`; `Copied!`; `Shuffle Seats`; `Start Game`; `Waiting for the owner to deal the next hand.`; `The room owner paused the game.`; `Next Hand »`.
Table chrome: `Options`; `Leave Seat`; `Away`; `I'm Back`; `Owner: <name>`; `Log / Ledger`; `Log`; `Chat`; `Chat (N)`; `Full Screen`; `Effects Volume`; `Toggle Pause`; `Pause the Game`; `Stop Game on Next Hand`; `Cancel Game Stop`; `Fold`; `Waiting`; `Away`; `In Next Hand`; `Quitting`; ` (Away)`; ` (Offline)`; `Offline & Away`; `All In`; `check`; `total <n>`; `No Limit Texas Hold'em`; `Dead Small Blind`.
Actions: `Call <n>`; `Bet <n>`; `All In <n>`; `Raise`; `Bet`; `Check`; `Fold`; `Check or Fold`; `Your Turn`; `Activate Extra Time (<n>s)`; `Extra Time Activated`; `Your bet`; `Min Raise`; `1/2 Pot`; `3/4 Pot`; `Pot`; `All In`; `Back`; `Call`; `Are you sure that you want do an unnecessary fold?`; `Do not show this again in this session?`; `Run it Twice?`; `Yes`; `No`; `Waiting for run it twice decisions (<n>s)`; `Show All Cards`; `Reveal`; `Some players are seeing the undealt cards.`; `Cancel`; `Confirm`; `OK`.
Dialogs: `Are you sure that you want to leave your seat?` / `You will enter in check/fold mode until the hand's end.`; `You are about to stop the game. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven.`; `You can't sit back without chips. Please add chips or request the game host to add chips for you.`; `Are you sure that you want to remove this player from their seat?`; `Are you sure that you want transfer the game ownership?`; `Are you sure that you want to allow this player to see the hole cards when not seated?`; `Are you sure that you want to put this player in away mode?`.
Menus: `Home`; `Game Configurations`; `Players`; `Preferences`; `« Back`; `Game`; plus all Preferences/Game labels (sections 10, 16).
Players/edit: see 9.3-9.4.
Log/ledger/chat: see 15, 17.
Fairness additions: see 20.

---
## 20. Fairness (the ONLY addition; owner requirement)

### 20.1 Principle
All shuffling is on the server with a CSPRNG. Before any card of hand N is shown, the server publishes a SHA-256 commitment to the full deck order and a secret salt. After the hand's result window closes it publishes the deck and the salt. Anyone can recompute the hash (a /verify page and a standalone script do this).
### 20.2 Shuffle
`crypto.randomBytes` (Node `crypto`), Fisher-Yates from i=51 down to 1, j uniform in [0,i] by REJECTION SAMPLING: draw an unsigned 32-bit integer u; with `limit = floor(2^32 / (i+1)) * (i+1)` reject and redraw if `u >= limit`; `j = u % (i+1)`; swap. No `Math.random`, no seeded PRNG, no use of salt as seed. Canonical unshuffled deck order for card codes: suits `s,h,d,c` x ranks `2..9,T,J,Q,K,A` (ranks ascending within suit) -> code = rank char + suit char, e.g. `Ts`, `Ah` (same encoding as the reference frames).
### 20.3 Commitment and deal mapping
- Salt: 32 random bytes (`randomBytes(32)`), hex (64 chars), independent from the shuffle.
- Preimage (UTF-8 string): `PT1|<gameId>|<handNumber>|<handId>|<prevCommitmentHex or "-">|<deck as 52 codes joined by " ">|<saltHex>`; commitment = lowercase hex SHA-256. `prevCommitment` chains hands of the table (genesis `-`).
- Deal mapping (cursor over deck[0..51]; PokerThen's own convention because the reference's is invisible): hole cards one at a time clockwise starting with the first active seat left of the dealer, two rounds (dealOrder recorded as player ids); then for each street: one burn card, then the street's cards (flop 3, turn 1, river 1); run 2 (RIT): continues from the cursor with burn + the cards of the streets still to deal; rabbit hunt reveals the next cards from the cursor in the same format (burn skipped first per street). The engine records `usage` entries `{kind:"hole"|"burn"|"board", run, street, playerId?, indices:number[]}` and publishes them in the reveal.
- Persistence: the commitment (and salt+deck, encrypted at rest not required) are persisted BEFORE the first hole card is sent (synchronously, ahead of the frame).
### 20.4 Reveal timing [ARCH; see risk R1 in ARCHITECTURE]
Published at the moment the hand's result window closes (the instant the next hand would be dealt: `sNAA` of the result frame, even when auto-deal is off; also at game stop or table close). Reveal contents: `{gameId, handNumber, handId, commitment, prevCommitment, deck[52], salt, dealOrder[], usage[], revealedAtMs}`. Risk: the full deck exposes mucked/folded hole cards and undealt cards after the result window (the reference never does); the owner asked for this.
### 20.5 Visible surface (unobtrusive; nothing else changes)
Two log lines per hand, rendered in a dimmed style (`entry-fairness`, colour #7d7c7c, smaller than other rows), inside the hand's log (and CSV):
1. directly after the `-- starting hand ...` line: `Hand commitment (SHA-256): <64 hex>`
2. inside the same hand's log after the reveal is published (appended after `-- ending hand #N --`): `Hand reveal: salt <64 hex>, deck <52 codes joined by space>. Verify` where `Verify` is a link to `/verify?game=<gameId>&hand=<N>`.
No new buttons, tabs, badges or settings elsewhere. `/verify` page: plain page in the same visual language (own layout, title `PokerThen - Verify a hand`): fields Table link or id, Hand number (Load), or paste commitment/deck/salt; shows PASS/FAIL for: (a) deck is a permutation of 52 distinct codes, (b) SHA-256 of the preimage equals the published commitment, (c) hole/board cards derived from `usage` equal the cards in the log lines, (d) chain `prevCommitment` equals the previous hand's commitment, (e) commitment was logged before the reveal time. Static client-side verification (WebCrypto) + `scripts/verify-hand.mjs` CLI (Node).
HTTP: `GET /api/games/:id/fairness/:handNumber` -> `{commitment, prevCommitment, committedAtMs, reveal | null}` (reveal only after 20.4).

---
## 21. Observable server behaviour contract (05; implementation detail in ARCHITECTURE)
- Everything not a live decision is HTTP (seat request, owner actions, config, start, log, ledger); live decisions and state use the WebSocket.
- Per-recipient frames; the server NEVER sends other players' hole-card values until revealed: for your own cards `{value:"6h", showing:false}`; for others `{value:null, showing:false}` (count only), also for spectators and the owner; folded players' entries become `{}` unless showing; at showdown/all-in reveal values with `showing:true` for everyone simultaneously with `name1`/`name2`, `prob1`; voluntary show flips to `showing:true` next frame. Rabbit cards only to requesters.
- Frames carry server clock `sN`; delta frames chain by `pre`==previous `now`; broken chain -> client sends `RUP` and receives a full frame. Full snapshot on connect/reconnect; client replays it (cards appear pre-flipped, timers resume from deadlines).
- Engine ping: server-side app ping ~20 s; client reconnect backoff 1 s .. 5 s (jitter .5), infinite attempts, connect timeout 20 s. If no pong within 5 s the connection is considered dead.
- Frame cadence: idle keep-alive every 4-20 s; each action produces result / next-actor (+0.8 s) / deadline-correction (+0.28 s) frames.
- `HTTP 202` => client reload; `pM`/version mismatch => reload.
- Presence: `disconnectedSince` per player; offline players are auto-handled as away/timed out like normal players (their time bank bar rules 7.3).
- Max sizes: nickname 2-14 trimmed unique; stack 1..1,000,000; chat 100 chars; preset name 15.
- IP/connection limits: error codes `too-many-connections`, `too-many-actions` (thresholds UNKNOWN U-N1).

---
## 22. UNKNOWN list (never guess; each has a named placeholder or a decision owner)

"Placeholder" = what the code must use until the owner/live research resolves it; each lives in ONE constants file so it can be swapped. Owner decisions are marked **[OWNER]**.

Home / create / join
- U-H1 Full copy of the marketing landing page below the hero (FAQ, features); PokerThen serves the Home hub for `/` too.
- U-H2 Content of the interactive tutorial; placeholder: static one-page rules summary at `/poker-tutorial`.
- U-J1 Server wording for `/new-game` 422 (empty/too long/duplicate nickname); placeholder: `must be unique and length must be between 2 and 14`.
- U-J2 `start-game` 422 `value` strings (e.g. fewer than 2 players); placeholder: `Not enough players to start the game.`
- U-J3 Meaning/trigger of auto-approval flag `aCP` and direct-sit; not exposed.
- Behaviour at 10/10 seats (Sit buttons all gone; waitlist omitted); what the guest sees if the owner edits the stack on approve; whether Cancel/Copy Link fire toasts (assumed none).
Layout / visual
- U-B1 First bet-panel preset label when opening a bet (assumed `Min Raise`; reference may show a min-bet label).
- U-E1 Mood emoji list (placeholder: 8 free emoji in PLACEHOLDERS.EMOJI); emoji reaction display duration.
- U-L1 When `#canvas.expanded` (aspect 1.954/1) is applied (unused here).
- U-L2 Full text of the disconnect banner between `Disconnected from the server` and `because of inactivity, click here to reconnect.`
- U-V1 Trigger of `.table.glow` overlay (not used).
- U-V4 Exact blue of opponent hand chips / indigo `#1`..`#2` chip colours beyond those listed.
- U-V5 Remaining CSS of 4/5-card holds (Omaha only; unused).
- U-V6 Colours of log entry classes (fold/raise/etc.); own design with the class names kept.
- Real-device rotation transitions; safe-area; phone landscape; layouts verified only at listed viewports (2-4 occupied seats live; 3/6/9/10 follow the slot table).
- Win-count/rebuy badge exact positions per seat; emoji set/list (U-E1: `Select` mood emoji button; placeholder: 8 free emoji).
- Hole-card variant class on phone (measured 56.2x65.4px only).
Art / sound
- U-A1 Reference sound durations/timbre.
- U-A2 **[OWNER]** Chosen felt/rail/card-back colours.
Chat
- U-C1 RESOLVED 2026-10-26: table chat bubble lifetime is a fixed 7.2 s (measured live for 2-word and ~10-word messages, desktop and phone; research/07 s6). The `2300 + 300*wordCount` formula is kept only for the phone auto-message balloon (unmeasured).
- U-C2 Profanity filter word list/behaviour; placeholder disabled.
- U-C3 UI when guests are blocked from chat (placeholder: input disabled with tooltip `Chat is disabled by the table owner.` [ARCH text]).
- U-C4 Real close gesture for the phone chat sheet.
Settings / roles
- U-G1 Shuffle Seats exact semantics.
- U-G2 Server field-error wording on `update_game` (placeholder: `invalid value`).
- U-G3 Min/max/step of SB/BB/ante/duration/time limit/time bank/refill; placeholder ints 1..1,000,000, duration 1..999, limit 1..999, bank 1..999, refill 1..999.
- U-G4 Spectator/god-mode data flow, `?` popover text, `How does it works?` link target.
- U-G5 Antes: who posts, when, log text, display (placeholder: every seated player posts `ante` before blinds; log `"X" posts an ante of N`).
- U-G6 Blind timer/break texts (`Next Blind: ... in mm:ss`, `<n> minutes Break in`) exact formats during live play; blind level application timing/countdown details.
- U-P1 Whether a removed player can re-request a seat (assumed yes).
- U-R1 Rebuy flow timers and approval timing; remaining rebuy texts.
- Pause/resume effect on server timeouts (U-T7 below), owner stack change DURING a hand, remove-player log line.
Rules
- U-D1 Missing big blind wording; missed-blind accounting beyond `posts a missing small blind of 10`.
- U-D2 Straddle with UTG stack < 40, straddler pref off while table allows, multiple/re-straddle.
- U-D3 Newcomer blind obligations other than UTG first hand.
- U-D4 Short all-in that is not a full raise: whether Raise is disabled for prior actors (client logic says yes via `cRPI`); engine implements the standard no-reopen rule; unverified live.
- U-D5 **Odd-chip distribution** (ties, odd pots, odd RIT halves, which run gets the extra chip). Placeholder `ODD_CHIP_RULE`: extra chip(s) to the first winner left of the dealer; RIT: extra chip to run 1 [STD guess, UNVERIFIED].
- U-D6 Last-aggressor vs first-left-of-dealer showdown order when action was not trivial.
- U-D7 Which hands show when `Reveal all hands when no more action is possible?` = No.
- U-D8 Hand-name text for chips/log for: High Card (log), Three of a Kind, Full House, Four of a Kind, Straight Flush, Royal Flush (placeholders in 12.2).
- Burn cards (invisible; PokerThen uses 20.3), Fast/Slow presentation exact timings (only 3/6/9 s labels).
- Hole-card equity for non-all-in situations: none shown.
Timing
- U-T3 Run-out spacing when RIT is declined/single run (06 saw ~1.1 s flop then 3.3 s per card; 05/07 say 4.0 s). Placeholder 4000 ms for all.
- U-T4 Showdown-presentation interplay: whether fold-win delay is also scaled by the setting; whether the all-in run-out award delay (8.07 s) is 6 s + 2 s or fixed.
- U-T5 Time-bank refill math (N hands), initial bank at seat (assumed full), whether bank survives hands.
- U-T6 Offline time-bank limit value (`maxOfflineTimeBank`).
- U-T7 Pause: effect on action deadlines server-side (assumed freeze and resume with remaining time).
- Auto-sit-out/auto-away thresholds after repeated timeouts; away auto-removal.
Equity
- U-Q1 Equity method and rounding (client rounds `prob1`); placeholder exact enumeration where cheap else Monte-Carlo 200k runs.
- U-Q2 Leader/green rule on ties (>= 50%?); placeholder: green = strictly highest equity, ties all green.
- U-RIT1 `Always` mode behaviour and log text; RIT after flop/turn layout (which cards shared) beyond the documented description.
- U-RH1 Rabbit reveal with partial board; what non-requesters see exactly after another presses Reveal; reveal window length precisely.
- U-S1 Side-pot display during continued betting (no label observed).
Log / ledger
- U-LOG1 Unobserved log lines (pause/resume/remove/ownership/straddle/ante/rebuy/stack change during hand).
- U-LOG2 Config-change field names beyond the four seen.
- CSV exact columns/header text of log export (`poker_now_log_<id>.csv`): placeholder `entry,at,order` (`at` ISO time, `entry` text) and ledger CSV fields listed in 15.3.
Network
- U-N1 Rate limits and thresholds (`too-many-connections`, `too-many-actions`, 429/503 on log).
- U-N2 Table retention/garbage-collection policy for abandoned tables [OWNER].
- Reconnect keep-alive specifics beyond 20 s ping/5 s pong; `Origin` check is PokerThen's own requirement (hosting brief).
Out of scope but noted: hand replayer page, schedule-next-game, Plus features, tournaments/clubs (omitted deliberately).

## 23. Live findings from research/08 (integrated 2026-10-26; supersede conflicting earlier text in sections 8, 10-14)
- No `Main pot` / `Side pot` labels: the frame has one `hand.pot` plus per-player bets; the log has one `collected` line per pot per run, main pot first, run 1 lines then run 2 lines.
- Run-it-twice odd chip: the pot is halved per run and the odd chip goes to run 1 (1005 -> 503/502). A 3-way chop of 33 is 11 each. A two-way tied odd chip is still U-D5 (placeholder: first winner left of the dealer).
- Short all-in (less than a full raise): players who already acted cannot raise (`hand.noReraiseIds`); the next min-raise-to = highest bet + the short shove's increment (160 + 60 = 220); a full raise (increment >= last increment) reopens the action for everybody.
- Rebuy (busted players only, Allow Rebuy on): at next-hand time the log says `Asking to busted players the rebuy decision.`; ONE shared 20 s window (REBUY_WINDOW_SEC; the 30 s value elsewhere is obsolete); `The player X requested a rebuy of N.`; owner approval (owner can change the stack); `The player X rebought. New stack N.` before `Player stacks:`; cancel/timeout/deny -> `The player X quits the game with a stack of 0.` Cancel sends action QNH.
- Time bank refills bankLength/N per hand dealt in (capped at bankLength). The server acts at the no-bank deadline (+1.5 s grace) unless the client sent ATB; the client auto-sends ATB once per turn when the pref is on and nothing is queued (W6 ActionArea only).
- Antes: `X posts an ante of 5` for every player in seat order before the blinds; dead money goes to the pot and is not part of call/min-raise amounts; header `(A:5)`; `The game's ante was changed from 0 to 5.` is logged at hand start.
- No log line for pause/resume or away/back (the `stand up` line at hand end stays). Owner stack change mid-hand: `WARNING: the admin queued the stack change for the player X adding N chips in the next hand.` (SET: `reseting to N chips`), applied with `The admin updated the player X stack from A to B.` at the next hand start. Remove player: `The admin X enqueued the removal of the player Y.` then `The player Y quits the game with a stack of N.`
- Rabbit hunt: only the missing cards are offered; `Undealt cards: <board> [new]` (empty board -> two spaces) is logged ONLY for the requester (onlyFor); each click extends the window by 3 s.
- Config changes mid-hand are logged as one `Game Config Changes` block (lines `* Name: old » new`) at next hand start; Allow Straddle and Showdown Speed apply at once (block logged immediately).
- `collected` combination order: groups ascending by (count, rank): kickers low to high, then pairs, then trips; among equal ranks the LAST dealt card is used (straight example 6c not 6h).
- Spectator Mode precondition: the owner is seated from creation, so "only while nobody is seated" is unsatisfiable; the engine requires table status `waiting`.
- Frame semantics confirmed against the real engine in a browser (INTEGRATION): `players[id].stack` = engine stack + open street bet, displayed stack = `stack - currentBet - gained`; `pot.totalText` = "total N" with N = pot + current bets computed client-side; between hands (auto deal off) `result !== null && turn.nextStep === null`; a folded player's `cards` is `[]` for every viewer including themselves.
