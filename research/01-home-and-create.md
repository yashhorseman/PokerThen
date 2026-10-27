# 01 - pokernow.com home, "New Game" flow, pre-game/join screens

Observed 2026-10-25 (passive, public pages, headless Chrome 155 via puppeteer-core). Evidence: `research/evidence/home/`.
Legend: OBS = measured/seen. SRC = read from their public JS (game.bundle / pnSidebar.bundle) and restated as prose. INF = inference. UNK = unknown.

## 0. STATUS: captcha gap closed by coordinator; section 8 (LIVE-VERIFIED) supersedes SRC-only statements in sections 3-4 where they differ.
(Original blocker text kept below for history.)

## 0b. Original BLOCKER
`POST /new-game` is protected by **Cloudflare Turnstile** (site key present in page globals; widget created with `appearance: "interaction-only"`, `execution: "execute"`, `size: "flexible"`). On submit a "Verify you are human" checkbox appears. Per the brief I stopped there: **I did not create a table**, so I could NOT observe: the real table URL/id string, the redirect in the live app, the invite/join screen as a guest, the seat-request popover rendered, the host "approve" UI, or any 422 text from the server. Everything on those is SRC-only (client code) and marked as such. To finish: owner creates a table (solves captcha) and sends me the `/games/<id>` URL (and ideally a second browser/phone as guest), or approves me driving a headed Chrome where the owner ticks the captcha.
Side note: I attempted `pkill` of leftover headless Chrome; the permission system denied it. Some headless Chrome/node processes from my scripts may still be running (harmless; kill with `pkill -f "Google Chrome"` if wanted).

## 1. Site structure relevant to a friends game
- `/` (logged-out) is a marketing landing page ("Play poker online with your friends / no download required", START A NEW GAME button, FAQ, feature list). Unknown/invalid `/games/<id>` returns **302 -> `/`** (OBS for ids `pgl_nonexistent123` and `abc`; final title "Poker Now - Poker with Friends", status 200). So "game not found" = redirect to the landing page, no error text.
- `/home` = hub page for returning users (section 2). `/start-game` = new-game form (section 3). `/games/<gameID>` = the table page (same React app/bundle as /start-game).
- Page titles: home "Poker Now - Home"; start-game "Poker Now - New Game - Private Poker with friends"; after create `document.title` is set to "Poker Now - Poker with Friends".
- Favicon: `<link rel="icon" type="image/png" href="/favicon.png">` (60x60 RGBA PNG), `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` (180x180 grayscale PNG). We draw our own art.
- start-game meta: `og:title` "Poker Now - New Game - Poker with friends"; `description` "Start to play free private poker home game online with your friends! No download and no registration needed. Up to 10 people."; og:image 1200x630.
- Fonts: Google Fonts "Muli" (home/sidebar) and "Mulish" (table app; computed `Mulish, sans-serif`), plus "Josefin Sans" 300/400/700 loaded.

## 2. /home (OBS; html saved `home.html`, text `home-text.txt`, shots `home-<vp>-fold|full.png`)
Layout desktop 1440x900: fixed dark sidebar 240px wide (bg #282828), main column `margin-left:240px` (CSS var `--pn-sidebar-width`, collapsed 64px, transition .2s). Breakpoint **max-width 1024px**: sidebar becomes a 48px top app bar (logo left, hamburger right) and main gets `margin-top:48px`.
- Top page-title bar: house icon + "Home" (bold 17px, color #3a3a3a, letter-spacing .34px, padding 11.9/17px, height 49.6px, bottom border).
- Hero (`.hub-home__hero`, bg #f7f8fb, padding 22.95px, 2-col grid 649/440 gap 25.5px; single column on phone):
  - eyebrow "POKER NOW" (13.94px/700 uppercase #646464)
  - h1 "Ready to play?" (39.95px/700, lh 45px)
  - lead "Start a private table with friends or jump into games from the Poker Now community." (17.85px, #4e4e4e)
  - Buttons (grid 2 cols gap 11.9px, each 214x58, radius 4.08px, 15.3px/700 uppercase, ls 1.02px, white text): **START A NEW GAME** bg rgb(146,156,74) (olive green) -> `/start-game`; **FIND A GAME** bg rgb(83,110,202) -> `/play-with-poker-now-community` (community, skip). Phone: stacked full width 334x47.7, gap 9.8px.
- Community-only sections (skip in PokerThen): "Featured on Poker Now" (Polymarket promo card), "Community seasons" (Sit & Go / Heads Up / Final Table cards, live stats, "ENDS IN 7 DAYS"), "The Lounge" ("~8,000 hands dealt every day", "JOIN THE LOUNGE").
- Footer (`.main-footer`): "© Poker Now 2026" + links Support(mailto:support@pokernow.com), Feedback(/feedback), About, Blog(/blog), Poker Tutorial(/poker-tutorial), X (formerly Twitter), Discord Server, Terms of Service, Privacy Policy; link color #808080 underlined 17px. Phone: centered single column list.
- Sidebar (`<pn-sidebar>` web component, shadow DOM, `mobile-query="(max-width: 1024px)"`). Items in order: logo (links `/`), collapse button (24x24, desktop only); **Home**; group header **"Play with Friends"** (green #8cff7a, 15px/700) -> **New Game** (`/start-game`), Multi-Table Tournament (`/mtt`); group **"Play with Community"** -> Find a Game, Sit & Go, Lounge, Final Table, Heads Up; Clubs; Highlights, Hand Replayer, Design Themes; bottom promo "Get POKER NOW +" (Plus upsell) and account bar "Sign in" (bg ~#6370ad, avatar placeholder). Only Home, New Game and Hand Replayer(?) matter for us; rest community/upsell. Active item rendered as white pill (radius 8px 0 0 22px) with dark text. Mobile: hamburger (bordered rounded square icon) opens left drawer ~72% width (screenshot `home-p390-menu-open.png`) with dimmed scrim. Collapse state persistence key: UNK (no localStorage use found in sidebar bundle; may be a cookie/attr).
- Network on load: `GET /current-player-infos` (section 6), GA/GTM. No localStorage entries on /home.

## 3. /start-game ("New Game") (OBS + SRC)
Screens: `start-<vp>-fold|full.png`, `start-empty-submit.png`, `start-filled.png`, measurements `start-computed.json`, html `start.html`, `start-empty-form.html`.
Background: the table-app canvas with a **blurred placeholder image** of a live table (`placeholder-background`, desktop `placeholder-*.jpg`, phone `placeholder-vertical-*.jpg`; transition `visibility .8s, opacity .8s linear`, z-index 30; hidden when connected). Page body bg rgb(32,30,31) + repeating pattern png. Canvas (#canvas) is 1440x810 at y=45 on 1440x900 (16:9 letterbox, black bars top/bottom); phone 390x844 -> canvas 390x702 at y=71 (portrait). **Root font-size = 0.032 x canvas height** (25.92px desktop, 22.464px phone) and all sizes are in em, so the entire UI scales with canvas height (SRC `defineRootFontSize`).
Card (`.waiting-container-center-container`), centered in canvas: bg rgba(0,0,0,.83), radius .6em (15.55px), padding 1em 1em 1.5em (25.92/25.92/38.88px), shadow 0 0 .5em rgba(0,0,0,.41), inner width 388.8px (=15em). Desktop card rect 440.6x476.8 at (499.7,211.6) in empty state; phone 381.9x395.6 at (4.1,224.2).
Contents top to bottom (verbatim):
1. h1 "New Game" - 0.9em (23.3px), weight 100, uppercase, letter-spacing .5em (12.96px), centered, white, padding-bottom .8em + 1px bottom rule.
2. p (15.55px = .6em, #aaa, centered): "Play free private online poker with your friends." / `<br>` / "No download and no registration needed."
3. label "Your Nickname" (.8em = 20.7px, white).
4. Input text: `maxlength=14`, placeholder "Your Nickname", `autofocus`, value "" ; height 3em (77.75px), border 2px solid rgb(179,179,179) (phone 1px), radius .3em, padding 0 .8em, font 1em white, bg transparent. No `required` attribute and no client-side nickname check.
5. (Turnstile slot `#cf-turnstile`, 0x0 hidden until submit.)
6. Button `button-1 green highlighted` submit: "Create Game" (uppercase, 700, 1em; bg rgb(63,167,108) #3fa76c, radius .3em, height 3.2em=82.9px, full width). While submitting label becomes **"Loading..."**.
7. p `.new-game-secondary-link`: "New to poker? " + link "Learn the rules in our free interactive tutorial" (`/poker-tutorial`, new tab, color rgb(127,220,157), underline) + ".".
TOS bar (`.tos-agreement`, fixed bottom, z 10, white bg, black 18.1px text, padding .5em .8em): "**Important:** by using Poker Now platform you accept our Terms of Service and Privacy Policy." + button "Got it!" (green small, 73.7x51.8). Shown until clicked; click stores localStorage `acceptedTOS` = ISO date string (OBS: `{"acceptedTOS":"2026-10-25T15:14:54.931Z"}`).
Behaviour (SRC component `Jf`):
- Submit: preventDefault, state loading=true, then if Turnstile configured -> run turnstile.execute() (invisible challenge; visible checkbox row "Verify you are human / CLOUDFLARE" 65px high, min-width 300px appears when interaction is needed and pushes the button down - OBS: empty submit already triggers it, i.e. Turnstile runs BEFORE any nickname check). On success -> POST.
- OBS: with an empty nickname, submit still starts Loading... + Turnstile; whether empty is rejected server-side is UNK (rejection arrives as 422 after captcha).
- Request: `POST /new-game` JSON body `{playerName: <string as typed>, gM: "th", playerStack: 1000, turnstileToken: <string>, bigBlind: 20, smallBlind: 10, cM: false}`. Optional extra keys only when URL has `?table_url=`/`mobile_table_url=`/`cards_url=` (custom skin, ignore). **So a friends game is created with fixed defaults: Hold'em ("th"), starting stack 1000, blinds 10/20.** There are NO other fields on the form (no blinds/stack/seat/variant inputs; those are changed later in the in-game owner settings menu - other agents' topic).
- Success response (SRC): `{gameID, playerID, isNetworkPlayer, playerUsername}`. Client then does `history.replaceState("", "", "/games/<gameID>")` (NO page reload/redirect), sets `document.title="Poker Now - Poker with Friends"`, and mounts the table app (socket connect). (If custom elements were passed it does a hard `location.href`.) Table URL therefore = `https://www.pokernow.com/games/<gameID>`. gameID alphabet/length: UNK (blocked).
- Failure: Turnstile is reset (`turnstile.reset()`), `loading=false`; HTTP 422 body is an object keyed by field -> message, `errors.playerName` is shown as `<span class="error-message">` right under the nickname input. Exact server wording: UNK. Other statuses show nothing.
- Connection phase after create/open of /games/<id>: full-card message "Connecting..." (inside the same card style); failure card text: bold "Connection failed!" + `<br>` + one of: default "Please check if the cookies are enabled and try again."; code `too-many-connections`: "Your IP reached the max quantity of connections, please try to finish some other browser tabs/windows."; `session-missing-token`: "Wasn't possible to detect your session. Please check if the cookies are enabled and try again."; `too-many-actions`: "You were disconnected because you sent too many actions."; or server-provided `msg`. A `locked` prop renders a card titled "Warning" with the server text (UNK when used).
- Page-global flags injected in HTML (OBS): `showSitAsAway=true`, `HTTP_202_RELOAD=true` (HTTP 202 on any API call forces `location.reload`), `ALLOW_GAME_TYPE_CYCLING`, `ALLOW_NIT_GAME` (ignore).

## 4. Opening an invite link (/games/<id>) - SRC only, not observed live (BLOCKER)
The invite is simply the page URL (host copies `window.location.href`). Everyone (host and guests) loads the same app, connects via socket.io, and gets a player identity from the cookie. No separate "join" page and no name prompt before the table: the guest lands on the table in status `watching` (spectator) and sees empty seats each with a **"Sit"** button (`allowSit` only if not tournament modes and status is watching). Empty seat shows its seat number (`table-player-seat-position-number`).
Click "Sit" -> popover `.popover-1.request-ingress-popover` (form, `noValidate`, closes on outside click, autofocus only on non-mobile) with fields:
- label "Your Nickname", input maxlength 14, placeholder "Your Name", prefilled from previous name for this player/cookie or table default, text auto-selected on click.
- label "Intended Stack" (host sees **"Your Stack"**), placeholder same as label, numeric text input (stack field component; default prefill UNK).
- checkbox "Allow unseated players to see my hole cards" (only when table has spectator-peek mode `showGodModeAgreement`).
- checkbox "Sit with Away set" (id `sit-as-away`; shown because `showSitAsAway=true`).
- submit button: **"Request the Seat"** (guest) / **"Take the Seat"** (host); while sending "Requesting…" (disabled).
Submit -> `POST /games/<gameID>/request_ingress` JSON `{seat:<seatNumber>, playerName, allowSpectator:<bool>, stack:<string/number as typed>, sitAsAway:<bool|undefined>}` timeout 10s. Errors: 422 -> object `{playerName:..., stack:..., sitAsAway:...}` rendered as `.error-message` under each field (wording UNK); 422 with code `failed_external_validation` opens a modal (club only, skip); 403 with code `missing_game_player` -> hard page reload. On success for guest (when owner approval required, i.e. not auto-approval): alert/toast **"You requested this seat. Wait for the owner approval."**; while pending, status = `requestedGameIngress` and a red action button **"Cancel Game Ingress Request"** appears (socket action `CANCEL_REQUEST_GAME_INGRESS`). Host sees the request and approves/denies with a "quick accept" popover (field "Intended Stack"/"Approved Stack", checkbox "do not show this again?" - details belong to the in-game owner agent). With auto-approval (`aCP`) plus intended name/stack globals the seat is taken directly (`directRequestSeat` posts same endpoint with `allowSpectator:true`; on 422 shows alert "An error occurred when requesting the seat." then lines "Player Name: <msg>" / "Stack: <msg>").
Host's own first seat: host is created already seated (status inGame, `isOwner`), so after create the host sees himself at the table alone.
Pre-game banners (SRC, class `table-warning-ctn waiting-players-ctn`) shown to host only while alone at the table: title **"Waiting for others"**, option "Share this link with **your friends!**" + button **"Copy Link"** (copies page URL, text flips to "Copied!" for 2000 ms then back), and a second option "Play with **Poker Now community**" + button "Join a Live Game" (community; skip) - variants with "Invite your group"/"Schedule next game" are scheduling upsells (skip).
Host "Start Game": button (`button-1 action-button green highlighted`) label **"Start Game"**, shown when: viewer is owner AND >1 players with status inGame AND table status is "waiting". Click -> `POST /games/<gameID>/start-game` (no body); 422 -> `window.alert(response.data.value)`. Also owner-only "Shuffle Seats" button next to it (`RS` socket action). Guest/other waiting text: "This table is waiting for new players. Please wait a moment." (tournament), "Waiting for the owner to deal the next hand.", pause: "The room owner paused the game.".

## 5. Player identity / storage (OBS + SRC)
- Cookie **`npt`**: HttpOnly, Secure, SameSite=Lax, Domain=.pokernow.com, Path=/, Expires = 2027-10-25 00:00 UTC (~1 yr, same fixed date for all), 50-char URL-safe token. Set by the server on first request to ANY page (`/home`, `/start-game`, `/current-player-infos`, `/games/x`). It is the anonymous player's session identity. Server also exposes the same player id via `/current-player-infos` (`id`, 10 chars e.g. `NpbdGpF_Lc`). Persisting this cookie = being the same seat/player and host on reload.
- Fallback for cookie-less browsers: `window.queryPlayerToken` (server-injected) -> sent as header `x-user-token` on all XHR and as socket query `ut`.
- Socket: socket.io, **websocket transport only**, query `{gameID, firstConnection:"true", layout:"d"|"m" (landscape=d desktop, else m), ut?}`; on reconnect it drops `firstConnection` and sends `loadedCampaignId`. Events seen: `rup` (last state), `gC` (game change), `newChatMessage`, `cH`, `nEM`, `rEM`, `GAME:TO_CLIENT`, `MTT:TO_CLIENT`, `failed`, `IGPU`, `DSP`, `UGD`, `registered`, `disconnect` (protocol detail belongs to other reports).
- localStorage keys: `acceptedTOS` (ISO date), `currentPlayer` (JSON prefs, default `{sound:"med", deckStyle:"two-color", autoActivateTimeBank:true, showPromotionalAnnouncements:true, showDefaultDesignTheme:true, showQuickAcceptPlayer:true, showSuggestedGesturePopover:true, showVideoVoiceChatWarning:true, version:1}`), `presets`, `shownAnnouncementsIds`, `bkp-chatMessage`, `last-maintenance-m`, `seenDefaultDesignThemeNotice`, `tvp-offered-games`, `last-feedback-auto-m`, `feedback-auto-m-off`, `last-highlights-auto-m-envelope`, `highlights-auto-m-off`. Identity is NOT in localStorage. Other cookies: Google Analytics only (`_ga`, `_gid`, `_ga_6XKYK79KZ9`, `_gat_UA-109238632-1`); `pn_login_door` (login flow, skip).

## 6. REST endpoints touched (all same origin, cookie auth)
| Method + path | When | Request | Response |
|---|---|---|---|
| GET `/current-player-infos` | every page load (sidebar) and in-game popovers | - | OBS 200 JSON `{"id":"NpbdGpF_Lc","networkUsername":null,"isNetworkPlayer":false,"isPremium":false,"plusPlan":null,"email":null,"profilePicUrl":null,"nowCoins":0,"hasNewHighlights":false,"newHighlightsEnvelopeId":null,"phone":"","allowPremium":true,"badges":[]}` (only `id`/`isNetworkPlayer` matter; rest community). Second hit returns 304; `Set-Cookie npt` re-sent each time. |
| POST `/new-game` | Create Game after Turnstile | see section 3 | SRC `{gameID,playerID,isNetworkPlayer,playerUsername}`; 422 `{playerName:msg}` |
| GET `/games/<id>` | invite link | - | HTML table app shell; unknown id -> 302 `/` |
| POST `/games/<id>/request_ingress` | seat request | section 4 | 2xx empty/ok; 422 field errors; 403 `{code:"missing_game_player"}` |
| POST `/games/<id>/start-game` | owner "Start Game" | none | 422 `{value:"..."}` shown via alert |
| GET `/games/<id>/ledger_<id>.csv`, `/games/<id>/poker_now_log_<id>.csv?turnstileToken=` | ledger / log download | - | CSV (log download is also Turnstile-gated) |
Static assets on `cdn.pokernow.com` with content-hash names. 11 sound mp3s are preloaded on /start-game (dumb-sound, new-player-beep, two-taps, chips, beep, fold, winner, card-place, warning-beep, chat-beep, lost) - sound names are useful for the audio spec.

## 7. UNKNOWN / needs owner help
- Real `gameID` format and the actual table URL (needs one captcha-solved creation). Whether the host sees a "copy link" before anything else, exact first-frame of the host's table (screens + timings).
- Server wording of 422 errors for empty/too-long/duplicate nickname, empty or invalid stack; max/min stack; whether trimming/duplicate-name checks exist.
- Guest-side screens (watching state, "Sit" button look, popover pixel measurements, pending state visuals, host approval UI, denial message, "table full" behaviour, what happens if the guest has no name).
- Sidebar collapse persistence mechanism and collapsed-state screenshot (click on shadow-DOM collapse button failed in my script).
- Turnstile behaviour for a real human (is a checkbox always shown, or only for bot-like clients).
- Nit: `cM:false` meaning of param `cM` (probably "cents mode"); `gM:"th"` = game mode Texas Hold'em.


## 8. LIVE-VERIFIED addendum (table `pgl2LtmWTm-hS_zm9D6Z_4QMs`, 2026-10-25 ~21:05-21:14 IST; guests = my own incognito contexts)
Evidence in `evidence/home/`: guest-d1440-1-landing.png, guest-p390-2-sit-popover.png, guest-d1440-2-sit-popover.png, g-*-a/b.png (validation attempts), g2-log.txt (422 bodies), req-guest-1-pending.png, req-hal-*.png, req-ivy-*.png, req-joe-*.png, host-5.png (approval modal), host-after-REJECT/ACCEPT/OK.png, host-10-waiting-banner.png, host-6-*.png, host-after-EDIT PLAYER.png, flow-log.txt.

### 8.1 IDs / URLs
- Table URL: `https://www.pokernow.com/games/pgl2LtmWTm-hS_zm9D6Z_4QMs` -> gameID = `pgl` + 21 URL-safe-base64-ish chars (A-Za-z0-9_-), 24 chars total (one sample only). Player ids are 10 chars of the same alphabet (e.g. `lDCRMnhKeg`, `Pj3ZUpUlFv`, `soThTfgjI2`). Page also calls `GET /api/games/<gameID>/game-elements?playersIds=<id,..>` right after load (response not captured).
- Guest opening the invite link goes straight to the table (no name prompt, no join page). Title "Poker Now - Poker with Friends". No captcha for guests. TOS bar shown again (fresh context) and covers the bottom ~78px.

### 8.2 Table chrome before play (desktop 1440x900 guest/spectator view)
- Top-left black tag with Poker Now logo (120x28 at y=45), left column: OPTIONS (hamburger) button; top-right text "OWNER: YASH" (small caps grey) and under it "NLH ~ 10 / 20" (bold); volume button (SOUND) under it; bottom-left "LOG / LEDGER" button with tiny "L" hotkey letter, next to the promo text "Polymarket & Poker Now / Join our Squad" (ad, skip); chat box "It's a bit quiet here. / Click on the balloon and send a Message!" with expand chevron, "M" badge, balloon button (label NEW MESSAGE), and "JOIN" video/voice box (skip voice/video); felt text "No Limit Texas Hold'em" on the table; pot "0" pill at top of felt; "POWERED BY POKER NOW" watermark.
- Spectator sees 10 dashed seat slots with number top-left and "SIT" (letter-spaced) in each empty one (labels read "SIT" via `.table-player-seat-button`; seat number `.table-player-seat-position-number`). Occupied seats show "WAITING" (clock icon) + name + stack before the first hand. Phone (390x844): OPTIONS top-left, volume top-right, buttons CHAT / LOG stacked bottom-left, JOIN box; no chat box, no LOG / LEDGER label ("LOG", "CHAT (n)"). Phone table is a portrait rounded-rect felt.
- Seats are rotated so the viewer's own seat is bottom-center (Joe seated at 2 appeared bottom center for him). Table theme was a seasonal purple Halloween felt (design theme, not default).
- Seated (approved) player's left column shows OPTIONS, LEAVE SEAT (`.top-buttons-button.quit`), AWAY (`.stand-up`), and an emoji "Select" button next to own seat.

### 8.3 "Sit" popover (verbatim, measured)
White rounded card with a pointer arrow toward the seat: desktop 311x351 at (738,236) for seat 1, bg #fff, radius .5em (12.96px), padding .9em (23.3px), font 25.92px root. Phone: 256x289 at (66,319), radius 11.2px.
Fields in order: label "Your Nickname" + input (maxlength 14, placeholder "Your Name", autofocus on desktop only, type=text); label "Intended Stack" + input (placeholder "Intended Stack", `inputmode=numeric`, `pattern=[0-9]*`, `required` attr but form is `novalidate`); checkbox "Sit with Away set"; green button "Request the Seat" (uppercase via CSS). Popover closes on outside click. No "allow unseated players" checkbox shown on this table.
Button while sending: "Requesting…" (disabled).

### 8.4 Server validation (request_ingress, all HTTP 422, JSON field->message; rendered as red `.error-message` text under the offending input, popover stays open, button re-enabled)
Request body: `{"seat":1,"playerName":"","allowSpectator":false,"stack":null}` (stack is sent as a Number or null if empty/non-numeric; sitAsAway omitted when unchecked).
| input | response |
|---|---|
| empty name + empty stack | `{"playerName":"must be unique and length must be between 2 and 14","stack":"must be a value between 1 and 1.000.000"}` |
| name "Zed", stack empty / "abc" (client sends null) / 0 / 99999999999 | `{"stack":"must be a value between 1 and 1.000.000"}` (note the dot thousands separator is verbatim) |
| empty name or "   " (3 spaces), stack 1000 | `{"playerName":"must be unique and length must be between 2 and 14"}` (so names are trimmed; 1 char also fails by this rule) |
| 20 chars typed | input truncates at 14 ("ABCDEFGHIJKLMN"); no "too long" error possible |
| name equal to an existing player's ("Dave") or to a still-pending requester | `{"playerName":"must be unique on this game"}` |
Accepted: name 2-14 chars after trim, unique on the game, stack integer 1..1,000,000. Success: HTTP 200 body `OK` (text).

### 8.5 Request / pending / approve / reject / cancel
- After a valid submit the guest gets a modal alert (white card, grey message bar, green "OK" button, scrim over the page) with text exactly: "You requested this seat. Wait for the owner approval." Behind it the popover remains with button "REQUESTING…". Desktop modal 778x200ish centered; phone modal 24px side margins.
- While pending the guest's seat slot shows nothing; a red full-size action button at bottom-right (desktop 415x90 at ~(1007,751)): "CANCEL GAME INGRESS REQUEST" (socket action). Guest can still spectate, chat.
- Cancel: click it -> immediately returns to spectator state (Sit buttons back, popover gone), no toast/message. Host's pending modal for that player disappears.
- Host side (owner tab): OPTIONS button gets a red circular badge with the number of pending requests (observed 3, 2, 1). A modal (white, centered, ~540px wide at 1300 viewport) opens automatically, one request at a time (queue): title `The player "<Name>" wants to join the game!`; grey box with label "Intended Stack" and a numeric input prefilled with the guest's requested stack (owner may edit => "Approved" amount); checkbox + text "do not show this again?" (this is the stored pref `showQuickAcceptPlayer:false`); three buttons left-to-right: red "REJECT", red "IGNORE", green "ACCEPT".
- ACCEPT -> host sees alert "The player was approved successfully!" with OK; guest is seated at the requested seat (status WAITING with clock icon, name, approved stack), guest UI changes to OPTIONS/LEAVE SEAT/AWAY. Latency effectively instant (<1s).
- REJECT -> host alert "The player was rejected successfully!" + OK; guest receives NO message: his popover/alert state is cleared, cancel button disappears and the seat becomes selectable again. (Observed: no dialog, no chat line.)
- IGNORE: not exercised (presumably dismisses the modal but leaves the request pending in OPTIONS > PLAYERS list). UNK exact effect.
- Pending requests are also listed in OPTIONS -> PLAYERS tab as "<Name> ID: <id> / Requested Ingress (Intended Seat Number: N)" with APPROVE and DENY buttons; seated players "Playing with <stack> stack" + EDIT; spectators "Watching" + EDIT. Top tab row: "« BACK", PLAYERS, GAME, PREFERENCES, VIDEO/AUDIO.
- A stale request from a closed browser stays pending (my crashed test left "ABCDEFGHIJKLMN" pending until host rejected it); it also blocks that name ("must be unique on this game").
- EDIT PLAYER screen: heading "<Name> (ID: <id>)", box "PLAYER STACK / CURRENT <n>" with segmented ADD / REMOVE / SET + "Value" input, green "UPDATE PLAYER", red buttons "REMOVE PLAYER" (confirm dialog "Are you sure that you want to remove this player from their seat?" CANCEL / CONFIRM; then alert "Player successfully removed." OK), "TRANSFER GAME OWNERSHIP", "PUT ON AWAY MODE". Tapping a player's seat opens a small menu: "HIDE AVATAR", "MUTE CHAT", "EDIT PLAYER" (owner only).
- Guest LEAVE SEAT: dialog "Are you sure that you want to leave your seat?" / "You will enter in check/fold mode until the hand's end." with red CANCEL, green CONFIRM; before a hand starts the seat is freed immediately.

### 8.6 Owner pre-game screen
- With only the owner (or <2 ready players) seated, a white rounded banner is centered over the felt (~540x83 at 2000-wide screenshot scale): title with clock icon "Waiting for others"; left column "Share this link with **your friends!**" + green button "COPY LINK"; a small grey "OR" circle divider; right column "Play with **Poker Now community**" + green "JOIN A LIVE GAME" (community, skip). Copy Link copies `location.href`; label becomes "Copied!" for 2 s.
- When >=2 players are seated, the banner disappears and two buttons appear bottom-right on the owner's screen: grey "SHUFFLE SEATS" (about 318x125 in the 2000px screenshot, ~1.5em tall) and green "START GAME". Verified visible after Joe was approved (host-after-OK.png). I did NOT press Start Game (shared table). Other pages (guests) never see these buttons.
- Owner chat auto-messages seen: "Elevate Your Game with Poker Now Plus. Activate your Free 7-Day Trial Today!" and "We'd love your feedback to improve Poker Now! / Send us your feedback · Don't show this again" (Poker Now system chat lines, community upsell; skip).

### 8.7 Still UNKNOWN
- "IGNORE" behaviour; exact Start Game 422 `value` strings; what the guest sees on approve if the owner edits the stack; behaviour at 10/10 seats ("Join Waitlist" component exists in code, only when waitlist enabled); whether Cancel fires a server toast; Copy Link toast; verbatim empty-nickname 422 for /new-game (not tested to avoid captcha).
- Cleanup: my guests (Gus, Joe, Hal, Ivy, ABCDEFGHIJKLMN) are all gone from the table; my browsers closed; host lock released. Another agent's pending request "PhoneP" (seat 6) and "Dave" were left untouched.
