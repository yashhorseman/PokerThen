# UI refinement plan — "as refined as PokerNow"

Source: hands-on study of a play-money private table on pokernow.com (desktop 1440×873 and an iPhone-sized viewport). We copy **behaviour, layout, proportions and timings**; all artwork (card backs, logo, table art, icons) is our own.

## What PokerNow does (measured)
- Everything inside the table scales from one font size: `1.8vw` desktop (25.9px @1440). Seat panel = 10em × 3.55em, `rgba(51,51,51,.76)`, radius .3em, shadow `0 0 .6em rgba(0,0,0,.25)`; name .7em bold `#c3c3c3`; stack .7em bold `#fff`. Hole card 3.47em × 4.05em (radius 7%, Abril Fatface 1.3em, shadow `0 0 .8em rgba(0,0,0,.4)`, `transition .3s`). Board card ≈ 4.4em × 5.5em. Pot pill 7.2em × 1.9em at ~24% from table top. Dealer button transitions `left/top .5s ease`.
- Desktop seats are **fixed** (seat N is in the same place for everyone). Anchors (centre, % of stage): 1 (62,90) 2 (38,90) 3 (16,75) 4 (9,50) 5 (16,25) 6 (38,10) 7 (62,10) 8 (84,25) 9 (91,50) 10 (84,75). Empty seats: dashed rectangle, seat number top-left faint, "SIT" letter-spaced.
- Table = tilted 3D ellipse with thick rim/depth, faint "No Limit Texas Hold'em" watermark and brand watermark, pot pill at the top ("total N" tag when street bets exist), board in the middle.
- Hole cards fan out **on the left edge of the seat panel**, overlapping it, slightly rotated. A red **hand-strength badge** (`HIGH CARD`, `PAIR (2)`, `TWO PAIR (8,2)` …) sits under the player's own cards once the flop is out (and under shown cards at showdown).
- **Turn**: the seat panel turns white (dark text) with a soft white glow (`glow-current`, 400ms linear) and a thin lime progress bar along its bottom edge; "● YOUR TURN" (yellow) above your buttons; a white bubble per seat shows the last action ("check", "call", "raise 60", "fold").
- **Bets** are lime-yellow round pills with a dark number between seat and table centre. Dealer button = lavender "D".
- **Card animation**: new cards flip (`card-flipper`, 150ms) with a short stagger; board streets flip one card after another.
- **Winner**: seat panel turns cream/gold, a green "+40" pill, hand badge; board cards that are not in the winning five are dimmed.
- **Buttons**: big outlined buttons (2px border, bold caps, 5px radius) — green CALL/RAISE/CHECK, red FOLD — with a tiny key-hint tab breaking the top border; unavailable ones stay in place, dimmed. A neutral outlined **CHECK OR FOLD** pre-action sits above. White **EXTRA TIME** button for the time bank.
- **Bet panel** (replaces the buttons after RAISE/BET): big "Your bet" number box with a BB hint, a row of presets (MIN RAISE · 1/2 POT · 3/4 POT · POT · ALL IN), slider with orange handle and −/+ , grey BACK (ESC) and green BET.
- **Chrome**: tiny logo tab top-left; left rail Options / Leave seat / Away (icon + 9px caption); top-right "OWNER: X" + "NLH ~ 10 / 20" + sound / pause (P) / stop; bottom-left LOG/LEDGER button + chat box (M); bottom-right actions. Options is a popover list (Home, Game Configurations, Preferences, …). Seat-request arrives as a modal "The player “X” wants to join the game!" with editable stack and REJECT / IGNORE / ACCEPT, and a red badge on Options.
- **Host start screen**: large buttons bottom-right (SHUFFLE SEATS, START GAME).
- **Session Log**: modal with tabs FULL LOG · LEDGER · REPLAYER, « HAND n-1 / HAND n+1 » paging and DOWNLOAD; winner lines highlighted.
- **Phone**: tall rounded "stadium" table, Options / Leave seat / Away as an icon row on top, you at the bottom, others in two side columns, pot + board near the top, "OWNER / NLH ~ 10/20" printed on the felt, CHAT and LOG stacked bottom-left, one row of 3 action buttons (BET/RAISE · CHECK/CALL · FOLD) at the very bottom with the pre-action button above; options popover; log as a full-height sheet; chat as a bottom sheet.

## Ownership (no two workers edit the same file)
| Area | Files | Owner |
|---|---|---|
| Table stage, seats, cards, animations, hand badge | `components/Stage.tsx`, `components/ui.tsx` (Card/Avatar parts only), `stage.css` | Worker A |
| Action area (buttons, bet panel, pre-actions, vote, show/rabbit, start) | `components/ActionArea.tsx` (replaces `Dock.tsx`), `actions.css` | Worker B |
| Room chrome (rail, top-right, chat dock, options popover, log modal, join-request modal, hotkeys, sounds, preferences UI) | `components/TablePage.tsx`, `components/Panels.tsx`, `components/Settings.tsx`, `components/icons.tsx`, `room.css` | Worker C |
| Shared | `styles.css` (tokens, buttons, inputs, modals, forms, toasts — **do not edit**), `layout.ts`, `prefs.ts`, `format.ts`, `net.ts`, engine/protocol/server | Lead |

## Contracts
- `layout.ts`: `PORTRAIT_QUERY`, `usePortrait()`. Use the same query string inside `@media` in your CSS.
- `Stage` (A): `export function Stage(props: { snap: Snapshot; prefs: Prefs; serverNow: number; onSeatClick(seat: number): void; inviteUrl: string })`. Root element `<div className="stage-box">` that fills its parent (`position:absolute; inset:0`). It reads reserve space from CSS vars set on an ancestor: `--room-top` and `--room-bottom` (defaults 3.5rem / 13rem desktop, 4.5rem / 9.5rem portrait). Felt colour from `data-felt` on the nearest `.room` ancestor (`green|purple|blue|burgundy`); deck colours from `html[data-deck]`. Exports `CardFace`, `CardBack` (A owns them; keep the same props).
- `ActionArea` (B): `export function ActionArea(props: { snap: Snapshot; prefs: Prefs; serverNow: number; send(c: ClientCommand): Promise<SendResult> })`. Root `<div className="action-area">`; it positions nothing absolutely itself — C places it. Handles its own hotkeys only when `prefs.shortcuts`.
- `TablePage` (C) wraps them: `<div className="room" data-felt=…>`; `.room-stage` (absolute, inset 0) contains `<Stage/>`; `.room-actions` contains `<ActionArea/>` (desktop: bottom-right; portrait: bottom row). C owns the overlays and everything not listed above.
- Hand badge text comes from `handLabel(bestHand(cards))` in `@pokerthen/engine` (`HandValue.best` = best five cards, used for dimming).
- Class names: A uses `.stage-box .stage .table3d .seat .seat-* .card .board .pot .bet .dealer-btn .hand-badge .bubble`; B uses `.action-area .act-* .abtn .raise-panel`; C uses `.room .room-* .rail .topright .chatdock .logmodal .optmenu .joinreq`. Do not reuse another area's prefix.
