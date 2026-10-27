# 03 - Phone / tablet-portrait UI of pokernow.com (in-game + pre-game)

Sources: (a) live measurements on a real play-money table, phone emulation (Chrome 155 CDP, iPhone UA, touch, DPR 3), (b) the
public game stylesheet `game-09d8e489f29e5f022a84.css` and the public game bundle (`game.bundle-3de25236...js`) read as prose,
(c) screenshots in `research/evidence/phone-ui/`. Items are tagged OBSERVED (measured/seen), CSS (read from stylesheet, not
independently measured), JS (read from bundle), INFERENCE, UNKNOWN. No site code/images/fonts are copied.

---------------------------------------------------------------------------------------------------------------------------

## 1. Core architecture: one scaled "canvas", rem = 3.2% of canvas height

OBSERVED + JS. There is NO responsive reflow by media query for the table. The whole game lives in a single `#canvas` div and
every size is in `rem`. A JS component (ResizeObserver on the canvas) does:

    canvasHeight = #canvas.getBoundingClientRect().height
    html.style.fontSize = (0.032 * canvasHeight) + "px"          // 1rem = 3.2% of canvas height
    html.style.--table-design-system-zoom = 16 / min(rem_px, 26)   // used by newer "design-system" widgets (modals)

So the entire UI is a uniformly scaled picture. Layout differences between phone/tablet/desktop are only (1) which canvas
aspect ratio is used and (2) the `.portrait` / `.landscape` class on `<html>`, which switches between two hand-authored layouts.

### 1.1 Orientation class
JS: `isMobileDevice = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)`;
`isIOSDevice = /iPad|iPhone|iPod/i`.
Orientation = if mobile UA: `screen.orientation.type` startsWith "portrait" -> "portrait" else "landscape" (fallback
`window.orientation` abs==90 -> landscape); if NOT a mobile UA: `matchMedia("(orientation: portrait)")` (viewport taller than wide).
Recomputed on `resize` and `orientationchange` (capture phase). On change: `<html>` gets class `portrait` XOR `landscape`.
=> OBSERVED consequence: an iPad (UA contains "iPad") held in PORTRAIT gets the phone layout (portrait canvas centered, not
stretched); iPad in landscape gets the desktop (16:9) layout. A desktop browser window narrower than tall also gets the portrait layout.
OBSERVED quirk: when the viewport was resized live (emulated rotation 1024x768 -> 844x390 without a reload) the canvas
resized but root font-size stayed at the previous value until reload (table drawn 888px wide in a 693px canvas). Real rotation
on a device did not get tested. A builder should recompute rem on every canvas resize AND after the orientation class changes.

### 1.2 Canvas sizing (CSS)
    #canvas { aspect-ratio:16/9 ; position:relative; display:flex; width:100%; overflow:hidden; box-shadow:0 0 2rem rgba(0,0,0,.34) }   (landscape)
    #canvas.expanded { aspect-ratio:1.954/1 }          (desktop only; JS adds .expanded only when NOT portrait)
    .portrait #canvas { aspect-ratio:1/1.8 }
    @media (min-aspect-ratio:16/9)  { .landscape #canvas { width:auto; height:100% } }     // viewport wider than 16:9: fit height
    @media (min-aspect-ratio:1/1.8) { .portrait  #canvas { width:auto; height:100% } }     // viewport wider than 1:1.8: fit height
    #main-container { height:100%; width:100%; display:flex; align-items:center; justify-content:center }   // centres canvas, letterbox
    body/html background: dark tiled pattern, colour #201e1f; game area background = darkened felt-ish image `background.jpg` cover

Portrait canvas is therefore a fixed 1:1.8 (width:height = 0.5556) box:
* viewport taller than 1:1.8 (e.g. 390x844 = 1:2.16): canvas is full width, height = 1.8*width, vertically centred (letterbox bars above/below).
* viewport less tall than 1:1.8 (e.g. 375x667 = 1:1.78, any tablet): canvas height = 100% of viewport, width = height/1.8, horizontally centred.
Portrait canvas = 17.36rem wide x 31.25rem tall (since rem = .032*H  ->  H = 31.25rem, W = H/1.8).

OBSERVED canvas boxes (portrait; DPR3; CSS px). rem = html font-size:

| viewport | canvas x,y,w,h | rem | note |
|---|---|---|---|
| 390x844  | 0, 71, 390x702 | 22.464 | letterbox 71px top and bottom (bg dark) |
| 360x740  | 0, 46, 360x648 | 20.736 | |
| 430x932  | 0, 79, 430x774 | 24.768 | |
| 375x667  | 2.2, 0, 370.6x667 | 21.344 | full height, 2.2px side bars |
| 768x1024 (iPad portrait, mobile UA) | 99.6, 0, 568.9x1024 | 32.768 | big side bars, UI just scaled up |
| 1024x768 non-landscape-flagged (see 1.1 quirk) | 298.7,0,426.7x768 | 24.576 | only when screen.orientation says portrait |

OBSERVED canvas boxes (landscape, after reload): 844x390 -> 75.3,0, 693.3x390 rem 12.48; 667x375 -> 0.2,0, 666.7x375 rem 12.0;
740x360 -> 50,0, 640x360 rem 11.52; 932x430 -> 83.8,0, 764.4x430 rem 13.76; 1024x768 -> 0,96, 1024x576 rem 18.432 (vertical letterbox);
1366x1024 -> 0,127.8, 1366x768.4 rem 24.588.

No `100vh/dvh/svh`, no `env(safe-area-inset-*)`, no `touch-action`, no `overscroll-behavior` appear anywhere in game CSS (grep: 0 hits).
=> there is NO safe-area handling; the 16:9 / 1:1.8 box is just centred; notches/home-indicator are only avoided incidentally
by the letterbox bars (on tall phones) - on 375x667-class phones the canvas touches all edges.
Root `<meta>`: `viewport = width=device-width, initial-scale=1, user-scalable=no` (pinch zoom disabled); `theme-color #272727`;
`apple-mobile-web-app-capable = yes`; `apple-touch-icon /apple-touch-icon.png`; web manifest only has name "Poker Now", short_name
"Poker Now", lang en, description "Private online home game poker up to 10 people with video/voice chat.", theme/background `#272727`
(NO `display`, NO `orientation` key => it is not locked to an orientation, not installable as standalone via manifest).

### 1.3 Keyboard / focus handling on iOS (JS)
* `focusin` on INPUT/TEXTAREA/contentEditable (mobile): the root font-size computation is FROZEN for that orientation while editing
  (prevents the UI resizing when the soft keyboard shrinks the viewport); iOS additionally freezes `<html>` height to the pre-keyboard
  layout height, and scrolls the focused field into view using `visualViewport` (`scrollBy(0, fieldBottom - (vv.offsetTop+vv.height) + 8)`).
* `focusout`: unfreezes, `<html>.style.height=""`, `scrollTo(0,0)`, recomputes font-size next animation frame.
* Chat input form: when fullscreen, `visualViewport` resize/scroll listeners translate the form up by `(formBottom - (vv.offsetTop+vv.height) + 8)` px so it sits 8px above the keyboard.
* Inputs have font-size 17.97px at 390 wide (1.1rem-ish/0.8rem*22.46) i.e. >=16px so iOS Safari does not auto-zoom.

---------------------------------------------------------------------------------------------------------------------------

## 2. Media queries found (complete list)

Game stylesheet (`game-09d8...css`, 309 KB) contains ONLY these @media blocks (verbatim effect):
1. `@media(max-width:600px){ .pn-text-display{font-size:var(--pn-text-xl);line-height:1.15} }` - newer "pn" design-system display text smaller.
2. `@media(max-width:600px){ .pn-subnav{gap:var(--pn-space-2)} }`
3. `@media(max-width:480px){ .pn-date-tile{width:3.75rem} .pn-date-tile__day{font-size:var(--pn-text-xl)} }` (tournament/schedule tiles; out of scope)
4. `@media(max-width:600px){ .pn-modal,.pn-modal--sm,.pn-modal--lg,.pn-modal--xl{width:100%;max-width:none;height:100%;max-height:none;border-radius:0}
   .pn-modal.pn-modal--floating{width:calc(100% - 2*var(--pn-space-3));height:auto;max-height:calc(100% - 2*var(--pn-space-5));border-radius:var(--pn-radius-md)} }`
   => new-style modals become FULL-SCREEN sheets <=600px (floating variant keeps margins).
5. `@media(min-aspect-ratio:16/9){ .landscape #canvas{width:auto;height:100%} }`
6. `@media(min-aspect-ratio:1/1.8){ .portrait #canvas{width:auto;height:100%} }`
7. `@media(max-width:480px)` = item 3 only.
Vendor stylesheet (react-datepicker): `@media (max-width:400px),(max-height:550px){ .react-datepicker__portal .react-datepicker__day-name,.__day,.__time-name {width:2rem;line-height:2rem} }`.
Home/landing css (`home-fe80ab...css`) was NOT analysed (public marketing page; not requested).
=> The phone/desktop distinction is NOT done by media queries but by the `html.portrait` / `html.landscape` class (452 portrait-only
rules, ~1 landscape-only rule in game.css) - see sections 3-9. The old rule-set (`.landscape x, .portrait x` pairs) is shared; `.portrait x` rules override.

---------------------------------------------------------------------------------------------------------------------------

## 3. Table + seat layout, PORTRAIT (all numbers in rem of the portrait canvas; px = rem * html font-size)

CSS (verified against measurements below). Canvas 17.36 x 31.25 rem. Coordinates are relative to the table/seat container whose origin = canvas top-left.

### 3.1 Table
* Table graphic: `.portrait .table` -> `height:28rem; width:17.4rem; background-size:auto 28rem; background-position:0 0; no-repeat`, a separate
  VERTICAL table image (`table-vertical`, red variant `table-vertical-red`). Remaining 3.25rem under the table = chat/log/join/fullscreen strip.
  (Landscape: table `55.55rem x 26.25rem`, horizontal image, centred.)
  OBSERVED 390x844: table box 0,71, 390.9x629 (=28rem).
* Pot: `.table-pot-size` portrait: `left:6.7rem; top:10.95rem; width:3.9rem; height:1.1rem`; main value `font-size:.7rem; line-height:1.1rem`; "total N" add-on chip:
  `top:-.35rem; height:.6rem; font .35rem` ("total" label small `.3rem`). OBSERVED 390: pot box 150.5,317,87.6x24.7; value font 15.72px (=.7rem).
  Landscape: `top:24%; left:43.4%; width:13%; height:1.9rem`, value font 1.1em, add-on font .65rem.
* Community cards: `.table-cards` portrait: `transform-origin:0 0; transform:scale(.54); top:12.45rem; left:2.2rem` (second board for run-it-twice `.run-2`: `top:48.5%; left:15%`).
  Landscape: `width:24.2rem; top:35%; left:28%`, gap between cards `.4rem`. Card size inside table-cards = `.card-container.big .card` 4.5rem x 5.5rem => portrait on-screen card = 4.5*.54 = 2.43rem x 2.97rem
  (OBSERVED at 390: .54*22.464*4.5 = 54.6px wide, 66.7px tall). 5 cards of 4.5rem + 4 gaps of .4rem = 24.1rem * .54 = 13.0rem wide, centred in the 17.36rem canvas (left 2.2rem).
  VERIFIED live: board cards measure 54.6 x 66.7 px at 390 (= 4.5 x 5.5 rem x .54), step 59.4px (card + .4rem gap, times .54), y=350.7, first card x=49.4, computed transform matrix(0.54,0,0,0.54,0,0).
* Game-type text (`.table-game-type`, e.g. "NLH"-style title ghost): landscape shows ghost text opacity .1 at top:14rem; portrait: `font-size:.6rem; top:14.95rem` and JS renders it ONLY when landscape (`"landscape"===orientation && <p class="table-game-type">`) so it is absent on phone.
* Blinds / owner line (`.game-infos`): portrait `top:16.5rem; width:100%; left:0; align-items:center; z-index:4` (centred column under the pot area).
  OBSERVED text: line 1 `OWNER: YASH` (class owner-table-name, .4rem, colour #d1ffe6), line 2 `NLH ~ 10 / 20` (blind-value, .45rem, #d1ffe6; game type font .7rem). Landscape: top-right, right:.8rem; top:.25rem; height 2.5rem; right aligned.
  OBSERVED box 390: 0,441.6,390x56.2.
* Dealer button: `.dealer-button-ctn` 1.2rem x 1.2rem (landscape 1.9 x 1.6rem); positions by dealer seat (portrait; top,left in rem):
  1:(23, 6.2) 2:(22.4, 5.2) 3:(17.9, 5.2) 4:(10.1, 5.2) 5:(4.9, 5.2) 6:(3.9, 6.2) 7:(4.9, 10.9) 8:(10.1, 10.9) 9:(17.9, 10.9) 10:(22.4, 10.9);
  a second button (straddle/"dead"-second) is offset .8rem within its container. Transition duration .5s (landscape rule `transition-duration:.5s` on `.dealer-button-ctn`).
  Landscape positions for comparison: 1:(19.7,28.5) 2:(19.4,19.7) 3:(18.1,15.7) 4:(13.6,11) 5:(7.7,12.3) 6:(4.5,25.2) 7:(4.5,28.5) 8:(8.5,40.7) 9:(14.4,42.7) 10:(18.1,37.9).

### 3.2 Seat anchors (the 10 seats ARE ALWAYS the same 10 slots; independent of player count)
JS: there are 10 seats; each seat renders `class="table-player table-player-seat table-player-<position>"` when empty (dashed box, seat number, "Sit" button)
and `class="table-player table-player-<position>"` when occupied. `position` is 1..10. Empty seats are only drawn while the viewer can sit (`showingEmptySeats`).
(`formation.reduce` in the bundle assigns position per seat. OBSERVED: for a SEATED viewer the table ROTATES so the viewer's own seat is always position 1 (bottom centre) and
the other seats keep their relative order clockwise (hero in real seat 6 saw: real seat 1 'yash' at position 6 (top centre), seat 2 Bob at 7, seat 3 Carol at 8, seat 4 Dave at 9; empty seats then show their REAL seat numbers: 10 at position 5, 9 at 4... i.e. numbers 10,9,8,7,5 printed on positions 5,4,3,2,10).
For a spectator positions = absolute seat numbers - OBSERVED: a spectator saw the host in seat "1" at bottom.)
There is no per-player-count formation (no "6-max re-spread"): 3 players or 9 players use the same anchors; empty seats show dashed "SIT" boxes.

Seat box size (portrait): `.table-player {width:5rem; height:3.95rem}` (avatar/infos part `.table-player-infos-ctn` height 1.9rem, bottom aligned; cards stick out above). Anchors `top/left` in rem of canvas:

| pos | top | left / right | note |
|---|---|---|---|
| 1 | 24 | left 6.2 | bottom centre (hero seat) |
| 2 | 20 | left .1 | left column, 4th from top |
| 3 | 15.5 | left .1 | |
| 4 | 7.7 | left .1 | |
| 5 | 3 | left .1 | |
| 6 | 0 | left 6.2 | top centre |
| 7 | 3 | right .1 | right column |
| 8 | 7.7 | right .1 | |
| 9 | 15.5 | right .1 | |
| 10 | 20 | right .1 | |

OBSERVED (390x844, rem 22.464, canvas y0=71): seat boxes (x,y,w,h): 1:139.3,610.1,114.3x90.7 | 2:2.2,520.3 | 3:2.2,419.2 | 4:2.2,244 | 5:2.2,138.4 | 6:139.3,71 |
7:274.3,138.4 | 8:274.3,244 | 9:274.3,419.2 | 10:274.3,520.3  (w,h same for all = 114.3x90.7 incl. 1-2px dashed border; occupied seat 112.3x88.7).
Same grid at 360x740: w105.7,h83.9, 1:(128.6,543.7) 6:(128.6,46) 5:(2.1,108.2) 7:(253.1,108.2); at 430x932: w125.8,h99.8; at 375x667: w108.7,h86.3 (1:(134.5,512.3)); at 768x1024: w165.8,h131.4 (1:(302.7,786.4)).
=> Vertical rhythm: rows at 0 / 3 / 7.7 / 15.5 / 20 / 24 rem; left column x=.1rem, right column x = canvas width - 5rem - .1rem (= 12.26rem), centre column 6.2rem.
Seats overlap the table image edges (left/right columns hang over the felt rim). Seat 6 and seat 1 overlap the table's top/bottom rim.
Empty seat visuals (portrait): dashed border `rgba(255,255,255,.3)`, seat number top-left `.5rem` colour rgba(255,255,255,.5) (hover white), label "SIT" `.5rem`, letter-spacing .2rem uppercase, colour #fff.
Landscape empty seat: border `1px dashed rgba(255,255,255,.1)`, number `.8rem #4e4c4c`, "Sit" `.6rem` colour #888.

Landscape seat anchors for comparison (percent of table box: top/left): 1:(82%,53%) 2:(82%,29%) 3:(66%,8%) 4:(40%,2.5%) 5:(14%,8%) 6:(2%,29%) 7:(2%,53%) 8:(14%,74%) 9:(40%,80.5%) 10:(66%,75%); landscape seat box ~ 18% x 13.5%.
OBSERVED landscape 844x390: seats 162x58.7?? (measured before the rem refresh) -> after reload at 844x390: 126.8x46.2; at 1024x768: 186.3x67.3; 1366x1024: 247.9x89.1.

### 3.3 Occupied seat anatomy (portrait)
(CSS, confirmed against screenshot `live-spectator-390-a.png`)
* Seat = `table-player` 5rem x 3.95rem. Info plate `.table-player-infos-ctn`: `position:absolute; bottom:0; height:1.9rem; background:#333; z-index:4; box-shadow 0 0 .5em rgba(0,0,0,.25)`; (landscape: translucent rgba(51,51,51,.76), radius .3rem, full seat height).
* Name `.table-player-name`: `left:.5rem; top:.38rem; font-size:.5em; height:.5rem; max-width:4.4rem; background:#333; z-index:2` (name is truncated by max-width; underlined dotted link style).
* Stack `.table-player-stack`: `left:.5rem; top:.9rem; font-size:.5rem; width:max-content; background:#333` (white text). OBSERVED name font 11.23px @390.
* Avatar image is hidden on phone (`.player-avatar-image-ctn{display:none}`).
* Hole cards: `.table-player-cards { transform:scale(.72); left:.4rem; top:.1rem }`; with 4 or 5 hole cards (`.four-cards/.five-cards`): `scale(.72) rotate(7deg); top:-.18rem; left:.65rem`. Card base size in seat = `.card-container.med`/`small`? (landscape: `med` 3.05x3.7rem, `small` 3x3.63rem, `small-2` 2.7075x3.276rem, `big` 4.5x5.5rem). OBSERVED live: card 56.3x65.4 px @390 -> 2.51 x 2.91 rem effective = 3.48rem x 4.04rem * .72 -> base card ~3.48x4.04rem.
  (UNKNOWN which variant class; measured effective size 56.3x65.4px @ rem 22.464.)
  Card overlap/rotation (landscape): p1 `rotate(-7deg) left:.3rem`, p2 `rotate(7deg) left:2.65rem`.
* Bet bubble `.table-player-bet-value`: portrait `font-size:.6rem` (landscape .8rem, background #eaffba pill, black text, glow). Positions per seat (portrait; relative to seat box):
  right-hand seats (7,8,9,10 columns on right): `right:100%` (bubble to the LEFT of the seat) top 1.1rem (seats 8,9,10) / 3.24rem (seat 7);
  left seats (2,3,4): `left:95%; top:1.1rem` (bubble to the RIGHT); seat 5: `left:95%; top:3.24rem`; seat 6 (top centre): `top:4.15rem; left:20%` (below); seat 1: `top:-1.43rem; left:20%` (above).
  OBSERVED @390: bets "10" and "20" shown as yellow-green circles/pills next to seats (see screenshot).
* Dealer button also has per-seat offset rules (`.table-player-N .dealer-button`) - ignore; use dealer-position table above.
* Active turn / winner state: `.decision-current` and `.winner` seat get a white plate (`.table-player-stack` background #fff, name background #fff) plus a glow `box-shadow:0 0 3em 0 #c3bfff` (decision, lavender) or `#e9ff63` (winner, yellow-green); winner also inset yellow glow and avatar scale 1.13 (transition .5s ease-in-out). A thin timer bar `.time-to-talk` under the plate: `width:5rem; height:.15rem; left:0`. OBSERVED screenshot: white "Bob 1000" plate with a purple/green progress bar under it.
* Status icon (`.table-player-status-icon`) (away/disconnected etc.): `width:2.3rem; height:2rem; top:.51rem; font-size:.3rem; background:rgba(0,0,0,.72); radius .3rem`, hidden for `fold`. OBSERVED label text "WAITING" with clock icon at the top-left of an occupied seat that is waiting for the next hand.
* Win-odds, per-player signals (NIT, numbers) scaled `.75`. `.player-hand-message-ctn` (hand name e.g. winner hand text): `right:0; top:1.86rem; --size:.7rem; max-width:100%` (two runs: top 1.76rem).
* `.player-table-signals-container.top`, emoji picker button, emoji container, spectators-count: `display:none` on phone. Avatars hidden.

### 3.4 Chrome around the table (portrait; rem of canvas, positions absolute)
| element | portrait CSS | OBSERVED box @390x844 (x,y,w,h) |
|---|---|---|
| Options (hamburger) `.top-buttons` | `top:.3rem; left:.3rem; transform:scale(.8); transform-origin:0 0`; button width 2.4rem, no border/radius, white text | 6.7,77.7,43.1x50.3 (label "OPTIONS" under 3-bar icon) |
| Sound/top-right `.top-right-buttons` | `top:.2rem; right:.1rem; scale(.65) origin 100% 0` | 354.2,75.5,33.6x32.1 |
| Chat / Log stack `.aux-chat-bottom-buttons-ctn` | `left:.2rem; top:25rem; width:3.7rem; height:2.65rem; border:.05rem solid #787878; radius .25rem; 2 rows; blur backdrop; font .4rem` | chat 5.5,633.6,83.1x30.3 ; log 5.5,663.9,83.1x29.3 |
| Mic/camera `.conf-controls` (voice join; OUT OF SCOPE, voice) | `top:25rem; left:4.2rem; control 1.5rem x 2.75rem` | 94.3,632.6,33.7x61.8 |
| Fullscreen `.full-screen-button` | `bottom:5.5rem; right:.2rem; scale(.78) origin 100% 100%` (landscape: 2.1x2.1rem black .3 opacity) | 348.7,612.7,36.8x36.8 |
| Next hand `.next-hand-button` | `width:5.5rem; margin-left:-2.75rem; top:19rem; left:50%`, tip badge hidden | - |
| Game actions `.game-decisions-ctn` | `position:absolute; left:.2rem; right:.2rem; bottom:.4rem` (see section 5) | (live: 4.5,764,381 wide) |
| Rebuy / suspended action chip `.suspended-action` | `bottom:2.6rem (high: 3.2rem); right:0; width:5.6rem; height:1.5rem; font .45rem` | - |
Phone has no keyboard-hotkey hints: `.button-1.with-tip:before{display:none}` and `.action-button:before{display:none !important}` hide the "f/k/c/r" letter badges.

---------------------------------------------------------------------------------------------------------------------------

## 4. Cards on phone
CSS. Card faces: white background, font "Abril Fatface" for rank, "Suits" icon font for suit glyph, border-radius 7%, box-shadow `0 .2rem .2rem rgba(0,0,0,.19)`.
Rank at `top:7%; left:18%; height:21%`; suit glyph `top:53%; left:38%`; in "sub-suit" mode (4-colour/hi-lo? class `sub-suit`) rank font .8em plus a small second suit icon.
Variants (rem): big 4.5x5.5; med 3.05x3.7; small 3x3.63 (font 1.3rem); small-2 2.7075x3.276 (font 1.17rem). Hole cards in portrait are additionally `scale(.72)`, board `scale(.54)`.
Hole card hover/"up" lift: `.card-container.up{top:-.2rem; transition-duration:.5s}` (board `up`: `top:-.5rem`). `.sneak` shows a 40%-opacity card-back overlay when the player peeked.
OBSERVED effective hole-card size on phone 390: 56.3 x 65.4 px (= 2.51 x 2.91 rem); face-down cards at opponents are fanned (rotated about +-7deg, overlapping) above the info plate.
Portrait-only: `forceSubSuit:true` is passed for the hero cards (JS: `forceSubSuit: "portrait"===orientation`), i.e. on phone the hero's cards ALWAYS show the small secondary suit icon under the rank so suits are readable at small scale.

---------------------------------------------------------------------------------------------------------------------------

## 5. Action bar and raise controls on phone (CSS + live-verified, see section 13 for measurements)

### 5.1 Buttons
`.portrait .game-decisions-ctn {position:absolute; left:.2rem; right:.2rem; bottom:.4rem}`, `.action-buttons {display:flex; gap:.2rem}`,
each `.action-button {flex:1; font-size:.5rem; padding:0 .3rem; height:2.3rem; line-height:2.3rem}` (base `.button-1`: uppercase bold, 1px-ish white border with thicker bottom border, radius .3rem).
Max widths: `raise`, `call` = 4.9rem; `check`, `fold` = 3.3rem; `iamback` 5rem; `cancel-request-ingress` 10rem.
At 390 (rem 22.464): button height 51.7px, font 11.2px, gap 4.5px, call/raise max 110px, check/fold max 74px.
Landscape (desktop) for comparison: `.action-button {padding:0 1.2rem; height:3.5rem; font-size:.8rem}`, gap .5rem, bar `bottom:.5rem; right:.7rem`, `.raise{width:6rem}`.
Button colours (shared): fold = red outline `#fc4117` (highlighted fill #c15942); check/call = green `#39af6b`/`#3fa76c` (fill #3fa76c); raise = yellow `#ffea00`; gray `#b9b9b9`; blue `#7f7df5`.
`.button-1:disabled{opacity:.25}`. Time bank button: `.button-1.time-bank{font-size:.32rem}` on phone (.7rem desktop).
Show-hand buttons (after fold/at showdown) on phone: horizontal row (`flex-direction:initial`), `--show-hand-button:.7rem`, buttons height 2rem, hotkey hint hidden, label bubble width 8*.7rem, border `#139249` green.

### 5.2 Raise controller on phone
Same component as desktop but scaled with transforms:
* `.raise-controller-form`: `left:0; right:0; bottom:0; width:initial; transform-origin:100% 100%`; inside it the confirm/cancel `.action-buttons` are `width:5.4rem; bottom:.1rem`.
* `.raise-controller` (slider panel, 20em wide on desktop, 4.7rem tall): phone => `transform:scale(.62); width:18rem; transform-origin:0 100%; position:absolute; bottom:0; left:0`.
* `.raise-bet-value` (the numeric input panel, 9em wide): phone => `transform:scale(.65); transform-origin:0 0; position:absolute; left:0; top:-1.4rem; box-shadow 0 0 3rem rgba(0,0,0,.31)`.
* Slider `.slider-control`: width 10.4rem, left 3.7rem (desktop 15rem / 2.5rem); thumb 1.6rem x 1.6rem (desktop 1rem) - bigger for touch; colour thumb #ffbb1f, track #585858 .3rem tall; `-/+` `.control-button` width 3.5rem (desktop 2rem), bg #434343, 2.3rem tall, glyph 1.2rem.
* Pre-set bet buttons `.default-bet-buttons` (1/2 pot, 3/4 pot, pot, ... 19% width each, .5rem font, 2rem tall) unchanged but inherit the .62 scale.
Effective touch sizes @390: slider thumb 1.6rem*.62 = 22.3px dia (small!); +/- buttons 3.5*.62 = 48.7px wide x 2.3*.62 = 32px tall; bet preset buttons 2rem*.62 = 27.9px tall.
(Measured live: see 13.4 - slider thumb is ~26px, presets 27.9px tall.)
JS: slider is a native `<input type=range class=slider-control>`; number field is a text input; selecting text uses `::selection #2c8b55`.
`input[type=number]` spinners removed. `-webkit-tap-highlight-color: transparent` on all buttons/links/[role=button]/.clickable; outline removed on focus.

---------------------------------------------------------------------------------------------------------------------------

## 6. Chat, log, menu access on phone

### 6.1 Chat = bottom sheet (OBSERVED + CSS + JS)
* Landscape: chat is a speech-balloon widget at the table with a hotkey `m`. Portrait: replaced by a button `Chat` (label becomes `Chat (N)` with unread count, e.g. "CHAT (2)" OBSERVED) in the 2-row button stack at left-bottom (see 3.4). Button classes `button-1 show-chat-button small-button dark-gray` (turns `white` for 800ms when a new message arrives).
* Tap `Chat`: `.chat` becomes visible: full-canvas dark backdrop `.overflow-black` (tap closes), and `.chat-container` bottom sheet: `width:100%; height:15rem; font-size:.7rem; box-shadow:0 0 3rem rgba(0,0,0,.6); padding-bottom:2.6rem; z-index:101` (taller 17rem when an in-game text banner exists). OBSERVED @390: sheet 0,332.7,390x440.3 incl. input row (input row 0,715.7,390x57.3 at the canvas bottom edge; `.chat-new-message-form` white, `height:auto; bottom:0; z-index:102`, input height 1.3rem).
* Header row of sheet (OBSERVED text): "Polymarket & Poker Now" + underlined link "Join our Squad" (promotional in-game text banner `chat-in-game-text`; max-height 4rem scroll). Empty state text (portrait): `It's a bit quiet here.` (landscape appends `Click on the balloon and send a Message!`). Input placeholder (verbatim): `Your Message (press Enter to submit)`; maxlength 100; required; submit with keyboard Enter; message draft is persisted in localStorage-like store key `bkp-chatMessage` and cleared on send; after send: input blur and sheet closes.
* A small red dot (recording indicator, `chat-recording-dot`) appears at the right of the input when chat is recorded for replay; tooltip (on click) text: `This table chat is being recorded: messages are saved with each hand and may appear in Hand Replayer and shared replays.` aria-label `This table chat is being recorded`.
* Muted players: button `<N> muted` (`.blocked-chat-button`) shown in the sheet only when mutedChatPlayersIds non-empty. Landscape-only "New Message" button is not shown on phone.
* Auto-message balloon (portrait only): when an automatic table message arrives while the sheet is closed, a blue (`#546eca`) speech balloon (max-width 11rem, 3-line clamp, font .45rem, tail at left 1.45rem) pops above the Chat button for `2300 + 300 * wordCount` ms; tapping it opens the sheet; suppressed while the player is deciding (shown after the decision ends).
* Esc and click-outside close; chat hotkey `m` disabled while input focused.
* New-messages counter chip `.new-messages-chat{font-size:.6rem; bottom:3.5rem; right:.5rem}` on phone. `.chat-expand-button` hidden on phone.

### 6.2 Log / ledger = modal (OBSERVED)
* Button `Log` (landscape label `Log / Ledger`). JS: `onClick` opens Session Log modal; `onLongPress` (500 ms press via pointer events; the click that follows is swallowed) opens the Ledger page directly. LONG-PRESS = the only long-press gesture found in the table UI.
* Modal `.log-modal` portrait: `height:95%`; OBSERVED @390: modal 11.2,88.5,367.5x666.9 (white card, rounded, X close button top right, backdrop dark). Title `Session Log`, empty text `Empty Log`, tabs `FULL LOG` | `LEDGER` | `REPLAYER` (tabs `order:-1; width:100%; flex:1` each at the BOTTOM above the buttons; active tab filled green) and button `DOWNLOAD` (ledger variant `ledger-download-button` full width). Entry rows font .65rem, time column 2.3rem.
* Generic old-style modals portrait: `.modal{margin:.5rem; width:100%; height:initial}` + `.modal-body{height:27rem}`; new `pn-modal` are full-screen <=600px (section 2).

### 6.3 Options menu (popover) (OBSERVED)
Tap hamburger "OPTIONS": white popover anchored under the button (arrow at its top-left, flipped vs desktop where it opens to the right): `top:2.9rem; left:0; min-width:7rem`. OBSERVED box @390: 6.7,129.8,186.3x206.8. Contents (verbatim): avatar placeholder + `Guest` + green `Sign In` button, then outline buttons (with icons) `Home`, `Game Configurations`, `Preferences`, `Video/Audio`, `Save Current Hand` (with yellow `+ Plus` tag). Tap outside closes. Options notice popover (owner notices) `width:9rem; top:2.9rem; left:0; notice font .5rem`.
(Other items in Options for seated player/owner are covered by the desktop report.)

### 6.4 Other
* `Full Screen` button (visible only on mobile UA when the Fullscreen API is supported and not already fullscreen): text "Full Screen" (visually hidden/ icon-only), JS `screenfull.request()`. Phone: bottom-right of table. iOS iPhone Safari does not support element fullscreen so button would not show there (`screenfull.enabled` false) - INFERENCE.
* "Sound" toggle top-right icon (speaker), `SOUND` text hidden (text-indent).
* `.help-link-game`, home footer, game lists, club info, spectators-count: hidden in portrait.

---------------------------------------------------------------------------------------------------------------------------

## 7. Touch gestures, tooltips
* JS search for touchstart/touchmove/touchend/swipe/dblclick/contextmenu in the game bundle: NO custom swipe or double-tap handlers. All interaction = click/tap on buttons. Only pointer-based custom gesture = long-press on Log button (500 ms -> Ledger).
* No swipe-to-fold / drag-to-raise; the bet slider is the native range input (drag). Pinch zoom is disabled by the viewport meta.
* Desktop hotkeys (f,k,c,r,i,y,t,s,esc,enter,m) are not shown on phone (badges hidden) but code is still active if a hardware keyboard is present.
* Tooltips: desktop hover tooltips/title `abbr{cursor:help}`; phone: popovers open on click (`openOnClick:true` in the chat-recording notice). Game-info popover `.global-popover-warning.game-infos-popover{width:8rem}` on phone.
* "Gestures" (paid emoji/animations thrown at players): `.gesture-movement` 4rem x 4rem on phone (6rem desktop); `#self-gesture-target` positioned `top:15.65rem; right:9.7rem`; suggested-gesture balloon scaled `--suggested-gesture-popover-size:.8` on phone. Out of scope (monetised social), but selector-level facts above are for completeness.

---------------------------------------------------------------------------------------------------------------------------

## 8. Pre-game / join screens on phone
### 8.1 Landing -> create (OBSERVED, 390x844 touch, `create-390.png`, `home-390*.png`)
* Cookie/terms bar at bottom (white): `Important: by using Poker Now platform you accept our Terms of Service and Privacy Policy.` + green button `Got it!` (rendered uppercase "GOT IT!" in-game). Bar covers bottom ~90px.
* `START A NEW GAME` (green, class `main-ctn-game-button`) -> `/start-game`. Create modal (blurred table behind) rendered full-width (inset 8px): title `NEW GAME` (wide letter-spacing), text `Play free private online poker with your friends.` / `No download and no registration needed.`, label `Your Nickname`, input placeholder `Your Nickname`, big green button `CREATE GAME` (while a human check is running shows `LOADING...`), footer `New to poker? Learn the rules in our free interactive tutorial.` (link on "Learn the rules in our free interactive tutorial").
* BLOCKER NOTE: creating a table shows a Cloudflare Turnstile `Verify you are human` checkbox (observed in headless AND headed automation); the owner had to pass it. Not bypassed.
### 8.2 Joining a table by link (OBSERVED, spectator first view) `join-01-390.png`
* Spectator view of an empty table: 10 dashed seat boxes numbered 1-10 with `SIT`; centre texts `OWNER: <NAME>` and `NLH ~ 10 / 20`; pot `0` pill; `OPTIONS`; sound icon; `CHAT`/`LOG` stack; `JOIN` (mic icon; voice - out of scope); fullscreen icon; terms bar.
* Tap `SIT` on a seat: white popover (arrow pointing at the seat) `.request-ingress-popover`, OBSERVED @390 inputs at x=80.8,w=217.7,h=46.9; font 17.97px:
  * label `Your Nickname`, input placeholder `Your Name` (maxlength 14)
  * label `Intended Stack`, input placeholder `Intended Stack` (type text, `inputmode=numeric`, pattern [0-9]*, required)
  * checkbox (27.7px) `Sit with Away set`
  * green button `Request the Seat` (rendered uppercase `REQUEST THE SEAT`, 217.7x42.7)
  Popover position per seat (portrait; related request popovers): for seats 2,3 right of the seat (`right:-12.5rem`), 4,5 same with `top:0`, 6 below the seat (`top:4rem`), 7,8 to the left (`left:-12rem`), 9,10 left/bottom, 1 above the seat (`bottom:3.4rem`).
* After submit: alert dialog (white rounded card, centred, 24px margin) verbatim `You requested this seat. Wait for the owner approval.` with green `OK`; the seat shows greyed form with `REQUESTING…`; a red bottom button `CANCEL GAME INGRESS REQUEST` (class `cancel-request-ingress`, 381px wide at the bottom, max-width 10rem rule applies in action row layout). Seat errors: `An error occurred when requesting the seat.` + per-field messages (HTTP 422).
* Seat requests may be auto-opened on the first seat (`autoOpenFirstSeat` flag) and `directRequestSeat` posts `/games/<id>/request_ingress` with seat, playerName (default), allowSpectator:true, stack (default) when `allowDirectSit` is on.
* While owner is approving, the owner sees the request in `waiting-players-ctn` style widgets (portrait: `.waiting-players-ctn{padding:.3rem}`, title .5rem, buttons .4rem font height 1.2rem).
* Lobby warnings (`.lobby-warning-ctn .warning p` .45rem, centred) e.g. waiting for players; `.table-warning-ctn`: `left:2.2rem; right:2.2rem; top:12.15rem; padding:.5rem; font .55rem; line-height .8rem; min-height 2.8rem`.

---------------------------------------------------------------------------------------------------------------------------

## 9. Orientation behaviour summary
* Phone portrait (any UA with Mobi/iPhone/Android..): canvas 1:1.8, vertical table, layout of sections 3-6.
* Phone landscape: canvas 16:9 (fit by height when the viewport is wider than 16:9; letterboxed left/right), same layout as desktop but rem = 3.2% of the (small) canvas height. OBSERVED 844x390: canvas 693.3x390, rem 12.48, hero seat 126.8x46.2 (text becomes ~9px); 667x375: rem 12.0, seat 122x44.5; 932x430: rem 13.76, seat 139.6x50.8. Landscape on phones is therefore a tiny-text copy of desktop - no special phone-landscape layout exists.
* `.landscape-warning` ("rotate your device") CSS exists but is NOT referenced by the bundle => no rotate prompt (dead CSS). Class contents (for completeness): title 11vw Josefin Sans uppercase.
* Tablet portrait (iPad UA): phone layout; canvas 569x1024 centred at 768x1024 (rem 32.8). Tablet landscape: desktop layout (1024x768 -> canvas 1024x576 centred vertically; `expanded` mode is desktop-only).
* Non-mobile browsers resized narrow: same logic through `matchMedia(orientation)`.

---------------------------------------------------------------------------------------------------------------------------

## 10. Differences phone vs desktop (verbatim copy and visibility)
* Log button label: desktop `Log / Ledger`, phone `Log`. Chat: desktop balloon + `New Message` button; phone `Chat` / `Chat (N)` button + bottom sheet.
* Chat empty state: desktop `It's a bit quiet here.` + `Click on the balloon and send a Message!`; phone only `It's a bit quiet here.`
* Hidden on phone: keyboard-hotkey badges, table game-type ghost text, avatars, emoji picker, spectator count, top-of-table signals, tips on top-right buttons, help link, expand button.
* Portrait-only extras: `Notes` signal for player notes rendered in the seat signals (`renderNotesSignal` only in portrait), auto-message balloon, hero cards always show sub-suit, `Save hand` link opens the replayer in a new browser tab (`window.open`) instead of in-page modal when portrait.
* Options popover opens downward (arrow top-left) on phone, rightward on desktop.

---------------------------------------------------------------------------------------------------------------------------

## 11. Implementation checklist for PokerThen (derived)
1. Single canvas component with `rem = 0.032 * canvasHeight`, all UI in rem; ResizeObserver; recompute on orientation change.
2. Orientation = UA-mobile ? screen.orientation : matchMedia(orientation). Two layouts keyed by a root class.
3. Portrait canvas aspect 1:1.8, landscape 16:9; letterbox centred; viewport meta with user-scalable=no; no safe-area (consider adding safe-area padding as a PokerThen improvement but note it deviates).
4. 10 fixed seat anchors per tables in section 3.2 for portrait, landscape percentages in 3.2.
5. Phone action bar flex row bottom .4rem; raise controller as scaled transform of the desktop control (scale .62 / .65).
6. Chat as bottom sheet with backdrop; Log button long-press 500ms -> ledger; Options popover; request-seat popover; verbatim strings above.
7. Freeze rem while an input is focused (soft keyboard); keep inputs >=16px.

---------------------------------------------------------------------------------------------------------------------------

## 12. UNKNOWN / needs owner help
* Not captured live (table state/time): run-it-twice board, rebuy dialog, 4/5-card hole cards, real winner glow frame-by-frame, bet-bubble positions for seats 2-5 (CSS only), two-player (heads-up) dealer position, 360x740 / 430x932 / 375x667 in-hand screenshots (empty-table measurements exist for them; in-hand only at 390x844), landscape in-hand screenshots, soft keyboard behaviour (headless; no keyboard), real device safe-area. Hero/hole-card variant class names.
* Real-device rotation transitions (rem stale quirk is only observed under emulation).
* Exact board-card class on phone (assumed `big` scaled .54) and hole-card variant.
* Home page / lounge on phone (out of scope).
* Turnstile on create: needs owner (done by owner).
* Whether landing page ("home" bundle) has additional breakpoints (home CSS not analysed).

---------------------------------------------------------------------------------------------------------------------------

## 13. LIVE-VERIFIED in-hand phone data (390x844, DPR3, touch, iPhone UA; hero = PhoneP seated, 4 opponents; rem = 22.464 px)

Evidence: `phone-seated-idle.png`, `phone-turn-actionbar.png`, `phone-turn-real.png`, `phone-raise-controller.png`, `phone-flop-turn.png`, `phone-now.png`, `phone-away-click.png`, `phone-leave-seat-dialog.png`, `phone-options-seated.png`.

### 13.1 Seated top-left control row (replaces the single OPTIONS button)
Three buttons in a horizontal row at top-left (each icon above a small uppercase label, no borders, white text): `OPTIONS` | `LEAVE SEAT` | `AWAY` (icons: 3 bars; arrow leaving a box; standing person).
After tapping AWAY the third button becomes `I'M BACK` (icon: office chair, label grey) and a big green `I'M BACK` button (112.3x51.7 at x=273.2,y=712.4, class `action-button green highlighted iamback`) appears at the bottom-right of the action bar; hero plate turns white; status text `AWAY` replaces the stack text on the plate; speech bubble "check" appears (pre-fold/auto-check bubble of the last action).
Hero plate says `QUITTING` after confirming Leave Seat mid-hand.
Leave Seat dialog (alert-1: white rounded card, 370.5x195.8 at x=9.8,y=324.1; body text on light-grey rounded box; buttons right-aligned `CANCEL` (red) `CONFIRM` (green)). VERBATIM: `Are you sure that you want to leave your seat?` / `You will enter in check/fold mode until the hand's end.`
Away status label above plate before the hand: `WAITING` with a clock icon (for seated players waiting for the next hand).

### 13.2 Hero (bottom centre, position 1) plate, cards, chips
* Hero seat 139.3,610.1, 112.3x88.7 (=5.0 x 3.95 rem). Info plate = bottom 42.7px (=1.9rem) of it (y=656.2..698.9). Name font 11.23px (.5rem) left 11.2px; stack text same line group below; names show dotted underline.
* Two hole cards: each 56.2 x 65.4, at x=149.6 and x=187.6 (step 38px = 1.69rem; overlap 18px), y=609.6; fanned with rotation (about -7/+7 deg), overlapping the plate top by ~10px. Face shows rank at top-left and big suit pip; the SMALL secondary suit pip beneath the rank is visible (sub-suit forced on phone).
* Hand-strength chip (hero only): small red rounded tag `PAIR (10)` / `PAIR (9)` at the top-right of the plate (e.g. 212.3,651.9, 39.3x11.8, font ~ .45rem white on red). At showdown for opponents: blue tag `TWO PAIR (A,2)`, red tag `PAIR (2)`.
* Dealer button `D` (white circle, blue D, 27x27px = 1.2rem) sits at position-dependent place: observed with dealer = seat 9 (right column): button at x=116.8,y=473.1 (27x27) to the LEFT of the plate; with dealer = hero: left of the hero cards, just above the plate (about x=76-114, y=592-628 in CSS px).
* Bet bubble: yellow-green pill with black bold number, e.g. hero bet "10" above the cards at 161.7,578, 31.9x26 (=1.42 x 1.16 rem); opponent bets drawn toward table centre: top-centre seat bet BELOW the plate (`20` at ~ (161,164)), right-column seats' bets to the LEFT of the plate (`20` at 244.4,211.2; `40` at 244.4,268.7).
* Pot: centre pill with the amount (large white, e.g. `40`, `110`) 87.6x24.7 at 150.5,317; during betting rounds the pill shows `0` + small `total 30` chip above-right (add-on) while the money is in front of players; after the round collects, pill shows the pot and `total` chip disappears.
* Opponent face-down cards: fanned pair above the plate (card back = purple/orange patterned), same 56x65 size, one pair per seat; folded opponents' cards disappear and plate dims (class `fold`); all-in opponent plate shows `All In` instead of the stack; winner plate: pale-yellow tint with green chip `+70` after the stack (`0 +70`), stack `0` for busted.
* Active turn (`decision-current`): white plate for the acting player, dark text, with a 3-colour timer bar (purple + green progress, ~4px) along the bottom of the plate, soft lavender glow around plate. Hero's turn additionally shows yellow dot + `YOUR TURN` (bold yellow, right-aligned above the action bar at 301-381, y~654, 79.8x14, class `action-signal`).
* Time-bank chip: white pill `EXTRA TIME ACTIVATED` (class `time-bank suspended-action highlighted`), 125.8x33.7 at x=259.7,y=671.9 (raised to y=658.5 when the raise controller is open ('high')). It appeared automatically each time the hero's decision clock ran past the normal time (hero was slow; it is the automatic time-bank usage message).
* Spectator-view first state before join: see section 8.

### 13.3 Action bar (hero's turn) - measured
Container `.game-decisions-ctn`: 4.5, 712.4, 381 x 51.7 (bottom edge 764.1 = canvas bottom 773 - .4rem(9px)); side margins .2rem (4.5px) each.
Buttons left to right, VERBATIM labels in this fixed order: `CALL 10` (label is "Call <amount>" with number appended), `RAISE`, `CHECK`, `FOLD` (when no bet to call: `BET 20` (preset "bet X" = minimum/default bet) , `BET`, `CHECK`, `FOLD`).
Boxes: Call 4.5..114.2 (109.7 wide, = max-width 4.9rem), Raise 118.6 (109.7), Check 232.8 (74.1 = 3.3rem), Fold 311.4 (74.1); gap 4.5px; all 51.7 tall (=2.3rem); font 11.23px (.5rem) Mulish bold uppercase; border radius 6.74px (.3rem); 1-2px outline with 3px thicker bottom border; colours: call/raise/check text+border rgb(57,175,107), fold rgb(252,65,23); transparent fill (dark). Disabled buttons (e.g. CHECK when facing a bet, RAISE while others to act) are at 25% opacity but still occupy their slot (the bar always shows 4 slots).
When it is NOT the hero's turn the container has class `low` and shows pre-action choices instead (observed: `CHECK OR FOLD` as a white-outline pill (above, right side, 125.8 wide like the time-bank chip) plus `BET`(disabled) `CHECK` `FOLD`, or `CALL 10` / `RAISE`(disabled) / `CHECK`(disabled) / `FOLD`).
Hotkey badges are not rendered on phone.

### 13.4 Raise / bet controller (tap RAISE or BET) - measured
Replaces the action bar; bar bottom region = `.raise-controller-form` 4.5, 658.4, 381 x 105.6, built of:
* `.raise-bet-value` card (top-left, floats ABOVE the slider): 4.5, 627, 131.4 x 68.6 (dark #2f2f2f, rounded .5em). Contains grey label `Your bet`, big white numeric input (text input, `inputmode=numeric`, font 40.4px = 1.8em, 126 x 34.5, centred, translucent field) with small yellow tag at its top-right showing the bet in big blinds (`2BB`).
* `.raise-controller` panel: 4.5, 698.6, 250.7 x 65.5 (dark) with
  - preset row at y=701.3, 5 buttons each 46.6 x 27.9, gap 2.7px (x=7.3, 56.6, 106, 155.3, 204.7), font ~ .5rem*.62: labels VERBATIM `MIN RAISE`, `1/2 POT`, `3/4 POT`, `POT`, `ALL IN` (for an opening bet the first label is `MIN BET`-equivalent; UNVERIFIED);
  - slider row at y=733.4: `-` button (4.5..53.2 x 32 tall, 48.7 wide), native range slider (track 144.8 x 4.2 at x=57.3,y=747.1; yellow-orange round thumb ~ 26px dia in screenshot), `+` button (206.4..255.1). Slider attrs: min 0, max = hero stack (1000), step 1, value = current bet (40). Row background slightly lighter than panel.
* Right side: `BACK` (grey fill, white text, 58.4 x 51.7 at x=264.2,y=710.1) and the primary action `RAISE` (green filled) at the right (x~330..385); time-bank chip stays above them.
* Presets: `+`/`-` buttons step by 1 BB? UNVERIFIED (not exercised). Bet input commits on Enter/`RAISE`.
All sizes equal the CSS scale(.62) panel; effective touch targets: presets 46.6x27.9 px (< 44pt guideline), +/- 48.7x32, slider thumb ~ 26px.

### 13.5 Gesture hint balloon
While waiting for a slow player the game shows (above the plate) a speech balloon: VERBATIM `Carol is taking too long?` / `maybe send a reaction` with 4 small paid gesture thumbnails each captioned `1 NC`, a close `x` and a checkbox `don't show it again`. (Monetised "NC"=Now Coins; out of scope but it occupies the area x=... top-right during slow turns.)

### 13.6 Showdown on phone (observed after the hand ended)
Winner(s)/losers reveal their cards face-up (cards rotate/flip, same fan); hand names appear as coloured tags at the top-right of each plate (`TWO PAIR (A,2)` blue/indigo, `PAIR (2)` red); winners' plates tinted light yellow with `+<amount>` green chip next to the stack; non-winners' plates dim. Hero's bottom bar becomes: `I'M BACK` (green) at left + a green segmented control `SHOW ALL CARDS | 7♣ | 9♠` (show both / show one card each; segmented, one row, height 51.7; right aligned, spans x~280..385 (in landscape it is a vertical stack)). Board cards: 5 cards at y=350.7, x=49.4,108.8,168.3,227.7,287.1 each 54.6x66.7 (centred: 49.4 left/48.3 right margin); a flop of 3 cards sits at x=49.4,108.8,168.3 (left-aligned - slots fill left to right, NOT re-centred as cards arrive); cards drawn at table-cards origin (left 2.2rem, top 12.45rem -> y=350.7), card gap 59.4px step (= (4.5+.4)rem*.54).
Dealer-hand cards dim/folded players: class `fold`, cards hidden.

### 13.7 Other seated-menu facts
Options popover while seated (same box as spectator), buttons VERBATIM: `Sign In` (green, top right, with `Guest` label), `Home`, `Game Configurations`, `Preferences`, `Video/Audio`, `Save Current Hand` (+ yellow tag `Plus`). (Owner additionally has `Players`.)
Request flow as owner sees it (desktop host): red badge `1` on OPTIONS -> Options -> `Game Configurations` -> `PLAYERS` tab: row `PhoneP  ID: <10 chars>` / `Requested Ingress (Intended Seat Number: 6)` with `APPROVE` (green) `DENY` (red); Approve opens a form `Player's Stack` (prefilled with the intended stack) + `APPROVE PLAYER` and `TRANSFER GAME OWNERSHIP`; result alert `Player successfully updated!` `OK`. Phone player then appears seated within ~1-2 s, view rotated so hero is position 1.

Evidence: `/Users/yashralhan/Projects/PokerThen/research/evidence/phone-ui/` (screenshots, `empty-table-measure*.json`).
