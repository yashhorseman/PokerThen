# 05 - Protocol and client-side logic (pokernow.com private table)

Method: static reading of the public game bundles (beautified locally, nothing copied into the repo) plus passive WebSocket
capture on the owner-provided live table (one incognito spectator context, and one extra tab in the host Chrome). Raw captures are in
`research/evidence/protocol/` (`host1.json`, `host2.json`, `spec2.json`, `spec3.json` = CDP Network frames with ms offsets; the 5 bundles
and 3 CSS files are in `bundles/`). Tags: **[OBS]** observed in captured frames, **[CODE]** read from the client bundle,
**[INF]** inference, **[UNK]** not verified.

Bundle build seen: `game.bundle-3de25236641b161daa4a.js` (665 KB min), `vendor.bundle-a9dfaa9ff533fa41d7e8.js` (2 MB), `runtime`, `innerLayout`,
`pnSidebar` (site chrome, a shadow-DOM sidebar web component, irrelevant to the table). CSS: `game-09d8e489f29e5f022a84.css`, `innerLayout-*.css`, `vendor-*.css`.
Client protocol/version constant: `fV = "0.1.72"` (also `version` in the state). **[OBS]**

---
## 1. Transport, handshake, identity

- **socket.io v2 client** (socket.io-client 2.x, socket.io-parser protocol 4, engine.io-client protocol **EIO=3**), `transports: ["websocket"]` only (no polling,
  no upgrade). **[OBS+CODE]**
- URL: `wss://www.pokernow.com/socket.io/?gameID=<gameId>&firstConnection=true&layout=<d|m>&EIO=3&transport=websocket`
  - `layout`: `d` when orientation is landscape, `m` when portrait (server picks desktop/mobile assets, e.g. `tableUrls.d/ds/m/ms`). **[CODE]**
  - optional `ut=<token>` appended only if the page defines `window.queryPlayerToken` (used for embedded/tv/mobile-app contexts; the same value is sent as
    HTTP header `x-user-token` on every axios call). Not present on a normal browser load. **[CODE]**
  - on every *reconnect attempt* the client deletes `firstConnection` and sets `loadedCampaignId = gameProperties.campaignId`. **[CODE]**
- **Identity = cookie `npt`** (HttpOnly, Secure, SameSite=Lax, Domain=.pokernow.com, Path=/, Expires ~1 year, issued by the first HTML GET of the
  game URL, even for anonymous visitors). The server derives the 10-char player id (e.g. `lOCSAx0p23`) from it; no login, no JS-readable token. Cookie value
  not recorded. Cloudflare fronts everything (`server: cloudflare`, `cf-ray`). **[OBS]**
  PokerThen equivalent: issue a random httpOnly cookie on first visit, map cookie -> playerId, never expose it to JS.
- Player display name is not part of the handshake; it comes from the seat request (HTTP) and from `gamePlayer.name` (remembered per cookie). **[OBS]**
- Engine.io frames **[OBS]**: server `0{"sid":"...","upgrades":[],"pingInterval":20000,"pingTimeout":5000}`; `40` (namespace connect);
  client sends `2` (ping) roughly every 20 s (29 pings in a 10 min capture), server answers `3`. If no pong within 5 s the engine closes ("ping timeout") and
  socket.io reconnects.
- First message after connect: `42["registered", {...}]` (full snapshot, see 3). Then `42["gC", {...}]` deltas.

### 1.1 Reconnect / disconnect behaviour [CODE]
- socket.io defaults in this build: reconnection on, attempts = infinity, delay 1000 ms, max delay 5000 ms, randomization 0.5, connect timeout 20000 ms.
- On `disconnect` the client dispatches `disconnected` -> `misc.connectionStatus = "disconnected"` (unless already `disconnectedByDisposal`). On successful
  reconnect the server again emits `registered` with the **entire** state; the client replays it through the same path as the first load (`preDefineState`,
  `loadedGameProperties`, `loadCurrentPlayer`, `newFrame`, `gamePlayerUpdate`, `connected`). No client-side event buffer or replay of missed deltas.
- Server event `DSP` (disposal) -> `disconnectByDisposal` (table closed/replaced, no reconnect UI). `failed` -> `onFailedConnection` = `window.alert("Error when loading the player's data.")`.
- Before the first `registered`, the page renders only the text `Connecting…`. `reconnectSocket()` (disconnect then connect) is exposed to UI and used by the "refresh/reconnect" affordances.
- Hard reloads: if a frame has `pM` truthy, or `fV` present and `!== "0.1.72"`, the client does `location.reload()` (forced client-version upgrade / maintenance);
  also reload if `expiredAt` is set on the frame. Maintenance notice: frame field `mM:{i:id,m:message}` shows a dialog with one button `Ok, I am aware!` (id remembered in localStorage `last-maintenance-m`).
- Server presence: `players[id].disconnectedSince` (ms) is shown to others; the "offline time bank" (`offlineTimeBankLimit`) is a separate extra bar used when the
  acting player is disconnected (see 6). **[CODE]**

---
## 2. Event catalogue

### 2.1 Client -> server (socket.io `emit`; all with `binary(false)`)
| event | payload | purpose |
|---|---|---|
| `action` | `{type, ...}` | all game actions (list below). Client strips `auto`/`socket` keys first. Not sent until the first frame exists, except `RUP`. |
| `new-message` | `"<text>"` (string) | table chat message |
| `me` | emoji payload | mood emoji (also via action `ME` -> `me`) |
| `in-game-text-impression` | none | analytics ping when the in-game text/ad is seen |
| `MTT:TO_SERVER` | `{type:"NCM"/..., content}` / `{type: GET_ALL_CHAT_MESSAGES}` | tournament chat (out of scope) |

`action` types sent by the client [CODE]:
| type | extra fields | UI trigger |
|---|---|---|
| `PLAYER_FOLD`, `PLAYER_CHECK`, `PLAYER_CALL` | - | decision buttons (also fired automatically from the "intended action" mechanism, 5) |
| `PLAYER_RAISE` | `value` (integer chips, total bet-to amount) | bet panel confirm. Also used for opening bet: label "Bet". |
| `ATB` | - | activate time bank ("Activate Extra Time (Ns)"); auto-sent when pref `autoActivateTimeBank` (default true) and it is my turn and I have bank left and no intended action is queued **(observed: our extra host tab fired it every turn)** |
| `NH` | - | owner presses "Next Hand »" (only shown when `aD` auto-deal is off) |
| `RS` | - | owner "Shuffle Seats" (randomize seats) before start |
| `UP` / `UR` | - | owner pause / unpause ("Toggle Pause", hotkey p) |
| `TSG` | `decision: bool` | owner stop game after this hand (true) / cancel (false) |
| `SUNH` | - | "Away" (sit out next hand) |
| `PLAYER_SIT_BACK` | optional `waitBB:true` | "I'm Back" / return on big blind. Blocked client-side with alert `You can't sit back without chips. Please add chips or request the game host to add chips for you.` if stack = 0 |
| `QNH` / `CQNH` | - | leave seat next hand / cancel that (confirmation text: `Are you sure that you want to leave your seat?` + "You will enter in check/fold mode until the …") |
| `CANCEL_REQUEST_GAME_INGRESS` | - | cancel my pending seat request |
| `DRITD` | `decision: bool` | run-it-twice vote Yes/No ("Run it Twice?") |
| `SHOW_HAND` | `cardToShow: "all" or card value like "8h"` | post-hand voluntary show (hotkeys s, 1, 2) |
| `RUC` | - | rabbit-hunt "reveal" click (hotkey h) |
| `RR` | - | owner "request rebuy" related button (see rebuy) |
| `TOGGLE_MUTE_PLAYER` | `otherPlayerID` | chat mute/unmute (stored server-side in `gamePlayer.mutedChatPlayersIds`) |
| `RUP` | - | request update: ask server for a full frame (sent when frame chain is broken) |
| `RUE` | - | request emoji state |
| `UCS` | `sid` | publish video-conference session id (out of scope) |
| `TNCOI` | - | nit-game opt-in toggle (plus feature, out of scope) |
| `newUserPreferences` is local only (not sent); preferences live in localStorage (9). |

`action` payload gets **no ack**; effect is visible only in the next `gC`.
Client-side guard on decisions: after pressing a decision button the buttons are disabled for 750 ms (re-enabled sooner on a new turn).

### 2.2 Server -> client
| event | payload | notes |
|---|---|---|
| `registered` | `{currentPlayer, gameState, gamePlayer, gameData}` | sent once per (re)connect. `gameState` = full frame |
| `gC` | delta frame | "game change"; ~60-300 B each; see 4 |
| `rup` | full frame | response to `RUP`; handled like `registered`'s gameState |
| `IGPU` | `{name, mutedChatPlayersIds:[], straddling:bool}` | "in-game player update": the per-player stored profile (sent to the player when it changes, e.g. after sitting). **[OBS]** (Host got it 3 times: on seat, at hand start) |
| `UGD` | game data object | replaces `gameData` (design theme, felt URLs, plus features) |
| `newChatMessage` | `{at, playerID, playerName, message, highlight?, autoMessage?}` | chat line |
| `cH` | `[ {at, playerID, playerName, message}, ...]` | chat history on load (dedupes against local messages by timestamp) |
| `nEM` | `[version, playerId, emoji]` | emoji delta; client compares `version` with its counter, if gap -> sends `RUE` |
| `rEM` | `{n: version, <playerId>: emoji ...}` | full emoji table |
| `GAME:TO_CLIENT` | `{type, payload}`; types: `PW` profanity warning `{warningType: firstWarning/firstBlock/secondBlock, expiresMinutes, message}`, `NG` new gesture(s), `DPC` disconnect-player-conference | |
| `MTT:TO_CLIENT` | tournament | out of scope |
| `DSP` | none | disposal |
| `failed` | none | handshake failed |

HTTP (axios, header `x-user-token` only if `queryPlayerToken`; cookie `npt` sent automatically; 10 s timeout) used for everything that is **not** a live game decision [CODE]:
- Seat request `POST /games/:id/request_ingress` body `{seat:<1..10>, playerName, allowSpectator:bool, stack:int, sitAsAway:bool}`; 422 -> field errors object `{field: message}` (labels via a map, prefix `An error occurred when requesting the seat.`). Success toast (non-owner, no auto-approval): `You requested this seat. Wait for the owner approval.`
- Owner: `POST /games/:id/approve_player {playerID}` (toast `Player successfully approved.`), `reject_player {playerID}` (`Ingress request successfully rejected.`), `update_player {playerID, stackChange, stackChangeMode}` (toast `The player will be updated on next hand.` / `Player successfully updated!`), `remove_player {playerID}` (`The Player will be removed on next hand.` / `Player successfully removed.`), `transfer_ownership {playerID}` (`Game ownership successfully transferred.`), `toggle_god_mode {playerID, allow}`, `put_in_away_mode {playerID}` (`The player entered in away mode.`), `start-game` (POST, no body; 422 -> `alert(response.data.value)`), `update_game` (POST full config object; toast `Game successfully updated.` when waiting, else `New configs successfully enqueued. The game will be updated on the next hand.`), `GET current_or_next_configs`, `GET players/:pid` (`{gamePlayer, enqueuedChanged}`), `GET spectators`, `GET players_sessions` and `players_sessions/:pid` (ledger), `POST request_rebuy {value}` (422 `{message}`; fallback `Was not possible to request the rebuy. Please try again.`).
- `GET /api/games/:id/game-elements?playersIds=a,b,c` (badges/notes per seated player; re-fetched whenever the seat list changes; rate limited -> 429 observed when many tabs poll), `GET /api/games/:id/game-schedule`, `GET /api/gestures`, `GET /auto-chat-message?lt=d|m&nf=true` (the bot "Poker Now" chat tip, fetched once after load).
- **Log**: `GET /api/games/:id/log_v3?hand_number=N[&after_at=<createdAt>]` -> array `{createdAt, msg}`; `createdAt` is epoch ms x 100 (client divides by 100 and shows `HH:MM` 24h). Client caches finished hands (max 50 hands) and for the current hand only fetches entries after the last known `createdAt` (incremental polling when the log tab is open / on new frames). Errors: 429 `Too many requests, please try again in some seconds.`, 503 `The log access is limited due the high load on servers. Please try again in some minutes.`
  Log download: `GET /games/:id/poker_now_log_:id.csv?turnstileToken=...` (Cloudflare Turnstile solved in a popover: `In order to download, please solve the captcha.` / `Important: the log file is limited to 20,000 lines.`).
  CSS classes derived from the line text by regexes: `start-game` (`^-- starting`), `entry-street` (`^(flop:|turn:|river:)`), `entry-collect` (` collected N from`), `entry-fold` (`folds$`), `entry-raise` (` raises to|bets|big blind of|small blind of N`), `entry-check` (` checks$`), `entry-call` (` calls N`). Player names in lines look like `"name @ playerId"` and are turned into `<abbr title='Player ID: ...'>`. So the log is **server-rendered text lines**, not structured events.
- **Ledger**: `GET /games/:id/players_sessions` -> `{playersInfos:{id:{id,name,buyInSum,buyOutSum,inGame,nitEscrow,net,...}}, buyInTotal, buyOutTotal, inGameTotal, nitEscrowTotal, gameHasRake, rakedValue, rakedValueWaitingToBeCollected}`; per player `GET .../players_sessions/:pid` -> `[{id,status:"playing"|..., buy_in, buy_out, start_hand_number, finish_hand_number, movements:[{kind:"tookSeat"|"quit"|"addStack", value}]}]`. Net per session = `buy_out - (buy_in - inGame - nitEscrow)` for the playing session. CSV: `GET /games/:id/ledger_:id.csv`. Replayer: iframe `/hand-replayer/game/:id[/hand/:hid[?frame=n]]`.

---
## 3. State objects

### 3.1 `registered` payload [OBS]
```
currentPlayer: {id, networkUsername:null, isNetworkPlayer:false, hasEmail:false, allowReportChat:false, isPremium:false}
gamePlayer:    {name, mutedChatPlayersIds:[], straddling:false}
gameData:      {plusFeatures:{double_board,custom_felt,bomb_pot,seven_deuce_bounty,nit_game,rake,game_type_cycle: bool},
                designThemeId, customCardsBackUrl, adDesignTheme, defaultDesignTheme, defaultDesignThemeTitle,
                tableUrls:{d,ds,m,ms}}   // felt images for desktop/mobile (+ "s" variants)
gameState:     full frame (3.2)
```
Client state container (React `setState({data})`, reducer chain run on every `newFrame`): `currentFrame`, `previousFrame`, derived `players{}`, `seats.formation`,
`table`, `tableCards`, `gameDecisions`, `miscGameDecisions`, `topControls`, `gameInfos`, `chat`, `misc`, `gameProperties`, `currentPlayer.gameState`, ...

### 3.2 Frame (gameState / merged gC) - all keys are short; meaning inferred from usage
Table-level:
- `id` game id; `status` `"waiting"|"inProgress"|"break"|"waitingPlayers"`; `mode` `"4fun"` (others: `tournament|hut|ftt`); `gM` game mode `"th"` (others omaha...); `cM` cent mode (chips are cents, shown /100); `ownerID`; `now` server ms of this frame; `pre` = `now` of the previous frame (chain id); `sN` server wall clock at send; `fV`/`version`; `mEV` emoji version; `eventsData` always `[]` (unused by client).
- Blinds: `smallBlind`, `bigBlind`, `ante`, `nB` blind-timer present, `nBA` next blind-up time, `gB` in break; `sBS` small-blind seat?, `dSB`, `deadButton`, `dealerID`, `dealerSeat` (1..10), `sBPI`/`bBPI` small/big blind player id, `lSPI` straddle player id, `lE` (always true here), `aD` auto-deal-next-hand on, `aS` game started flag, `aGC`/`aVC`/`cR` allow-game-chat/allow-video-chat/conference-running, `rH` rabbit hunting allowed for the hand (server flag), `rIT` run-it-twice mode (`"ask_players"` observed; other values [UNK]), `sPM` spectator/god-mode table, `gDM` god-mode-allowed player ids, `recordChatForReplay`, `allowStandaloneRebuy`, `uP` paused-at ms (truthy when paused), `mTB` max time bank (seconds; 10 observed), `expiredAt`.
- `seats`: `[[seatNumber(1-10), playerId], ...]` sorted by join; **only occupied seats listed**. Client builds `formation[10]`: rotates so the current player is at position 1 (bottom); position p -> seat number `((idx) % 10)+1`. Empty seat button shown if `status` is watching/waiting and seats < `maxQuantityPlayers` (default 10).
- `players{id:{id,name,status,stack,winCount,quitCount,isNetworkPlayer,avatarID,intendedSeat?,nPY?,qNH?,sUNH?,disconnectedSince?,rebuyCount?}}` — everyone known (seated, spectating, requesting). `status`: `watching`, `requestedGameIngress` (with `intendedSeat`, requested `stack`), `waitingNextGameToEnter` (seated mid-hand), `inGame`, `standingUp`, `quiting`. `nPY` = "needs ... (flag set at seat; `<D>` deleted in next frame)" [UNK exact meaning].
- Hand identity: `gN` hand number, `hI` hand id (12 chars), `iHPI` ids in the hand, `pGS{id: "inGame"|"fold"|"allIn"}` per-player hand status, `pot` (committed-to-previous-streets pot), `tB{id: amount|"check"}` current street bets (`"check"` literal when checked), `cHB` current highest bet (0 / number; client also treats `"check"`), `mR` min raise-to, `mAVTB` max amount the actor can bet (effective stack cap), `wBACPI` ids who "have the option" (big blind option, can check when `cHB` equals their bet), `cRPI` ids who have acted this street ("check/raise passed ids"), `bigBlindCheck` (true when big blind checked its option; triggers 2-taps sound).
- Street: `gT:[run, stage]`: run 1 or 2 (run-it-twice), stage 0 preflop,1 flop,2 turn,3 river,4 showdown,5 game result (`gT=[]` before first hand). `nR:[numberOfRuns]` or `[2,0]`. `oTC{"1":[cards],"2":[cards]}` community cards by run, in deal order (strings like `"7s"`, `"Ts"`, rank+suit lowercase; `T` = ten; client shows `10`). `tHC` cards in winning hand highlight list. `rHC{1:[..],2:[..]}|null` rabbit-hunt revealed cards, `rHP[ids]` players currently hunting.
- Action control: `cPI` current player to act, `pITT` "player is taking turn" (same id; null in the 800 ms gap between turns), `sNA` next-step action code, `sNAA` next-step-at (ms epoch server time; drives every countdown), `pASA` player action started at, `dLTWoTB` deadline without time bank, `dLTWTB` deadline with time bank, `pTB{id: ms}` remaining time bank per player, `directToNexTurn` true when all remaining are all-in (run out / RIT / reveal cards), `wRITD` waiting for run-it-twice decisions, `rITD{id:bool}` votes.
- `pC{id:{cards:[{value, showing}], name1, name2, name1RH, name2RH, prob1}}` player cards (see 3.3). `gameResult{id:{ "1":{hC:[cards used],position:1,(name?)}, "2":{...}, gained:n }}` or `null`.
- Misc: `sG` stop-game-after-hand queued, `promptingRebuyPlayerIDs`, `waitlistIds`, `maxQuantityPlayers`, `minMaxBuyIn`, `rakePlans`, `nit*`, `bombPot*`, `sevenDeuce*`, `gameTypeCycling*` (plus features, out of scope), `aCP` auto-accept players (aka auto approval), `startingAt`, `clubID`, `chipType`, `waitingStateMessage`, `nextGameSchedule`, `tVP`.

### 3.3 Hidden-card rules (what the server sends) [OBS - decisive]
- The server builds **per-recipient** frames. In `pC[playerId].cards` every player in the hand has an array with **one entry per hole card**, `{value, showing}`.
  - For **my own** cards: `{"value":"6h","showing":false}` (value present, showing false = face up only to me).
  - For **every other player** (also for a spectator or a non-seated viewer): `{"value":null,"showing":false}` — the card *count* is sent so the client can draw card backs; **the face values are never sent to anyone else** until revealed. A pure spectator got `null` for all four players, including the owner's cards (compare `host2.json` vs `spec2.json`, same frame). No god-mode data was observed.
  - Folded players: their entry becomes `{}` (client then renders no cards for them, except if `showing`).
  - At showdown / all-in run-out the server pushes values with `showing:true` **to everyone at once** (`{"value":"Ac","showing":true}`), together with `name1`/`name2` hand descriptions and `prob1`.
  - Voluntary show after the hand (`SHOW_HAND`) flips those cards to `showing:true` in the next frame for everyone.
  - Cards are sent as new `pC` content only on deal frames; later deltas carry only the changed leaf keys (e.g. `pC:{id:{name1:...}}`).
- `name1`/`name2` = server-computed hand description for run 1 / run 2 in the exact strings seen: `high card`, `pair (6)`, `pair (A)`, `two pair (7,4)`, `two pair (A,7)`, `straight`, ... (client prints them verbatim; with a rabbit-hunt variant `name1RH`/`name2RH` rendered `(RH: <text>)`).
  `name1` is computed for the current board as it grows (flop/turn/river deltas), so it changes each street; `<D>` deletes `name2` when not applicable. Hand names are only sent for players whose cards are showing (all-in/showdown) - for me during normal play I get them for my own hand (e.g. `"name1":"straight"` on the flop for the host).
- **Run-it-twice / all-in equity is computed on the server** and delivered as `pC[id].prob1` (a float, e.g. `46.2`, `25.8`, `28`; 2 decimals later streets: `87.15`, `19.05`, `100`, `0`). The client only does `Math.round(prob1)` for display and only when `gT[1] !== 5` (not on the result screen). **[OBS+CODE]**
  Equity is sent only when `directToNexTurn` (everyone all-in or only one player left with chips): first at the "reveal" frame (stage 0, `sNA:"NSAAD"`, 4 s), then in each street delta (flop/turn/river). In run 2 `prob1` is re-sent for run 2's board (value refers to the run currently dealing).
- Rabbit hunt (see 7): client only sends `RUC`; the undealt cards come back in `rHC`. In captured spectator frames `rHP` listed requesters (`["2nQ…","lOC…"]) while `rHC` stayed `null` -> the reveal is **recipient-specific** (only players who clicked get the cards) [INF; the revealed `rHC` frame was not captured because the capture had no requester].

---
## 4. Delta protocol and how the client applies it

Per `gC`:
1. `preDefineState`: reload if `pM` or `fV != "0.1.72"`; compute `sNDifference = localNow - sN` (**no RTT compensation**: `getServerNow() = Date.now() - sNDifference`).
2. If `r` is truthy the frame is a full replacement. Otherwise **if `pre !== currentFrame.now` the chain is broken -> send `action {type:"RUP"}`** and wait for a full frame; no other recovery. (First `gC` after `registered` has `pre` = the `now` of the snapshot, e.g. `1792941518751`.)
3. `merged = deepMerge(currentFrame, delta)`: recursive merge of plain objects; **arrays and scalars are replaced wholesale**; the sentinel string `"<D>"` **deletes the key**. (e.g. `tB:{"id":"<D>"}` removes a bet, `wRITD:"<D>"`, `gameResult:"<D>"`, `players:{"id":"<D>"}` removes a player, `intendedSeat:"<D>"`).
4. reducer chain recomputes everything (players view model with `isDealer,isBigBlind,isWinner,isDecisionPlayer,needsTakeDecison,currentBet,gained,renderCards,highlightedCards,handDescription,prob1,actionStartedAt,actionLimit...`).
Frame cadence [OBS]: idle table: one empty keep-alive `gC` (only `now/pre/mEV/fV/sN`) every 4-20 s; each player action produces 3 frames: (a) the action result (`tB`, `cRPI`, `pGS`, `sNA:"NSAA"|"NSAF"`, `sNAA = now+800`), (b) ~0.8 s later the next-actor frame (`sNA:"FCPFS"`, `cPI/pITT/pASA/dLTWoTB/dLTWTB`, `sNAA = now+20000`), (c) ~0.28 s later a tiny frame correcting `sNAA` to include time bank (`sNAA = dLTWTB`).
`sNA` codes seen: `FCPFS` waiting for actor (fold/check/call/raise), `NSAA` next step after action (800 ms), `NSAF` next step after fold (800 ms), `NSAAD` all-in reveal (4 s), `NSARD` run-it-twice vote window (10 s), `NSAGRS` game-result display then auto-next-hand (8 s after showdown), `NSAGR` same after a no-showdown win (2.9 s observed, 3 s), `NSAGR/NSAGRS` shows the owner button "Next Hand »" if `aD` is false, `FOAR` rebuy owner approval wait, `null` idle. Streets in run-out advance every **4000 ms** (`sNAA = now+4000`).

---
## 5. Intended actions (pre-actions) — client logic [CODE]
- Buttons never send immediately: `updateIntendedAction{kind:PLAYER_FOLD|PLAYER_CHECK|PLAYER_CALL|PLAYER_RAISE|CHECK_OR_FOLD, value}`. If it is my turn (`needsTakeDecison`) and the table is not paused it is sent at once as an `action`; otherwise it is stored (`gameDecisions.intendedDecision = {kind, forGameTurn:gT[1], forHand:gN, forCurrentHigherBet:cHB}`) and highlighted on the button. On every frame while it is my turn `executeIntendedGameDecision` sends the stored kind (`CHECK_OR_FOLD` -> `PLAYER_CHECK`).
- Stored intent is dropped when the hand number or street changed, or (for check/call) when `cHB` changed; `CHECK_OR_FOLD` becomes `PLAYER_FOLD` if someone bet (`cHB` truthy and I am not in `wBACPI`).
- Toggle behaviour: pressing the same pre-action again clears it.
- Fold confirmation: if folding is "unnecessary" (`foldNeedsConfirmation = !cHB || I'm in wBACPI`): modal `Are you sure that you want do an unnecessary fold?` with a "don't ask again" checkbox (session-global flag).
- Bet panel (`betControl` screen): `value` init = `initialBetValue` (min raise `mR`, or `cHB`, or BB, capped by stack); slider 0..`maxAllowedToBet` step 1 with `-`/`+` buttons stepping by one big blind; text input (digits only; in BB display mode input is in BB with 2 decimals, `floor(bb*bigBlind)`); valid if value in `preciseValueAllowedToBet` (all-in amount, `cHB`, etc.) or `minAllowedToBet(=mR) <= v <= maxAllowedToBet`; submit label `Raise` if `v > cHB` else `Call` (and `Bet` when `cHB`=0); `Back` returns to buttons. Confirm: if `v > cHB` -> intended `PLAYER_RAISE value=v`, else `PLAYER_CALL`.
  Preset buttons: `Min Raise` (= `mR`), `1/2 Pot` = `cHB + P/2`, `3/4 Pot` = `cHB + P*3/4`, `Pot` = `cHB + P`, and `All In` appended unless game is an Omaha variant; where `P = pot + sum of numeric tB (with my own bet replaced by cHB)`; every value clamped to my stack. Quick label on the Call button: `Call <n>` / `Bet <n>` (when cHB=0, n = big blind) / `All In <n>` when the call >= stack; `n` formatted per display preference, plus `BB` suffix in BB mode.
- Button visibility rules: Check enabled if `cHB` is `"check"`/0, or I'm all-in, or I'm in `wBACPI`; Call shown if not all-in and `cHB != my bet` and (my turn or `cHB`); Raise enabled if my turn, not already in `cRPI`, and stack > `cHB`; Fold enabled unless all-in; `Check or Fold` (hotkey i) shown only when it is not my turn, I'm not all-in, and (no bet or I have the option). `Activate Extra Time (Ns)` appears if `mTB` and my `pTB>0` (N = `floor(pTB/1000)`), caption becomes `Extra Time Activated` once `dLTWTB != dLTWoTB && sNAA == dLTWTB`. Label `Your Turn` shown when it is my turn.

---
## 6. Clocks and timers [CODE+OBS]
- Server clock offset: `diff = Date.now() - sN` captured from **every** frame (latest wins). All countdowns use `getServerNow() = Date.now() - diff`.
- Action timer: component re-renders every **100 ms** (`setInterval(forceUpdate,100)`). Bars: `time-bank` and `normal-time` divs inside `.time-to-talk`, widths in %:
  `total = dLTWTB - pASA - offlineAdj`; `bank = dLTWTB - dLTWoTB`; `regular = total - bank`; `elapsed = serverNow - pASA - offlineAdj`; regular consumed % = `min(elapsed, regular)/regular*100`; bank consumed % = `(elapsed>regular ? elapsed-regular : 0)/bank*100`; widths = remaining share. Both bars get class `red` and the warning beep plays (only for my own seat) once consumed > **70 %**.
  Observed durations: 20 s action time (`dLTWoTB - pASA = 20000`), time bank pool `pTB` in ms (10000 = 10 s default shown as `(10s)`), activating the bank extends the deadline by the remaining bank (`dLTWTB`), bank is spent in ms (e.g. 10000 -> 1101).
  Disconnected actor: `offlineTimeBankLimit` (`maxOfflineTimeBank` feature) draws a single `time-bank normal-time` bar from `max(pASA, disconnectedSince)` to the limit.
- Countdown text format `mm:ss` (floor, zero-padded, `00:00` when <=0). Show-hand buttons stay until `sNAA - 600`. RIT/rebuy/next-hand banners show whole seconds via `(Ns)`.
- Pause: `uP` holds the pause timestamp; countdowns freeze using it as "now" (`nBA - uP`).
- Chat bubble above a player: visible `2300 + 300 * wordCount` ms, trimmed to 30 chars + `…`; poll every 300 ms.

---
## 7. Animations from state diffs [CODE]
There is no animation engine (no tween library); everything is **React re-render + CSS transitions/keyframes** keyed on class/prop changes.
- Board cards: model `tableCards.cards{1:[{value,rabbitHuntingCard,highlightedCard,afterPadding}],2:[...]}` built from `oTC` (+ `rHC`). `padding` = number of cards already "revealed in the pre-run" (`{0:0,1:3,2:4}[nR[1]]`) when RIT is active; doubled board sets padding 0. Each `TableCards` component keeps `flippedCards[]`; on `cards.length` change it flips **one new card at a time, minimum 150 ms apart**, polling every 50 ms, playing the card-place sound per flip (unless secondary sounds disabled). First mount shows all existing cards already flipped (reconnect = no animation). Card key `tc-card-<run>-<index>`; classes `table-cards run-1|run-2`.
- Player bets/chips: derived each frame from `tB[id]`: `currentBet` (number or `"check"`). Sounds fire in `componentDidUpdate`: checking (`currentBet` becomes `"check"`) or big-blind-check -> two-taps; fold (`gameStatus` -> fold) -> fold sound; any change of numeric bet -> chips sound; own `isWinner` string becoming set -> winner sound.
- Turn change: `pITT/cPI` drives `isDecisionPlayer`/`needsTakeDecison`; "Your Turn" beep once per turn when no pre-action is stored.
- Winners: `gameResult[id]["1"|"2"].position == 1` -> `isWinner = "1"|"2"|"12"` (true if only `gained>0`), `gained` shown as `+n`; winning cards = `hC` of run 1 and run 2 concatenated -> `highlightedCards`; all other board cards get low opacity (`notHighlightedLowOpacity`) while `tHC`/`hC` are present.
- Dealing/new-hand: purely a result of `gT:[1,0]` + `pC` frame (cards appear with CSS), `oTC` reset to `{"1":[]}`.
- Sounds (Howler 2.x; start muted until a first user gesture unlocks audio via a silent `dumb-sound`; volumes `off 0 / low .15 / med .45 / high 1`, default `med`): two-taps = check, fold = fold, chips = bet change, winner = my win, card-place = board flip, beep = my turn, warning-beep = timer >70 %, chat-beep = incoming chat (own excluded, setting `disableChatMessageBeep`), new-player-beep = join-request counter increased (owner), `lost` unused.

---
## 8. Sequence diagrams (observed frames unless marked)

### 8.1 Join (anonymous visitor -> spectator -> seated)
```
Browser                          Server
 GET /games/:id  ------------->  200 HTML (+ Set-Cookie npt)  [bundles from cdn.pokernow.com]
 WS connect ?gameID&firstConnection&layout=d|m -> 0{sid,pingInterval:20000,pingTimeout:5000}, 40
                            <--  42["registered",{currentPlayer,gameState(full),gamePlayer,gameData}]
 GET /api/games/:id/game-elements?playersIds=... (re-run on seat list change)
 (idle)                     <--  gC {now,pre,mEV,fV,sN}  (keep-alive every 4-20 s)   <->  "2"/"3" ping every 20 s
 click empty seat (modal: name, stack, "allow spectator", sit as away)
 POST /games/:id/request_ingress {seat,playerName,allowSpectator,stack,sitAsAway} -> 200
                            <--  gC {players:{pid:{status:"requestedGameIngress",name,intendedSeat,stack,winCount:0,quitCount:0,isNetworkPlayer:false,id}}}   (to all)
                            <--  IGPU {name,mutedChatPlayersIds,straddling}  (to the joiner on approval/seat)
```
### 8.2 Seat approval (owner)
```
Owner UI: owner sees notification count (misc.requestingIngressPlayers from players with status requestedGameIngress) + quick-accept popover (pref showQuickAcceptPlayer)
Owner -> POST /games/:id/approve_player {playerID}   (or auto when aCP=auto-approval; first seat of the owner is immediate)
Server -> all: gC {pTB:{pid:10000}, seats:[[1,"own"],[2,"pid"]], players:{pid:{status:"inGame",intendedSeat:"<D>",nPY:true}}}   (status "waitingNextGameToEnter" if a hand is running)
Server -> all (~50 ms later): gC {players:{pid:{avatarID:null}}}
Server -> all: client refetches game-elements (seat list changed)
Reject: POST reject_player -> gC removes players[pid] (key "<D>")  [INF]
```
### 8.3 Start hand
```
Owner (>=2 inGame, status waiting): buttons "Shuffle Seats"(RS) and "Start Game" (POST /games/:id/start-game)
Server -> gC {aS:true, rH:true, rIT:"ask_players", ...}
Server -> gC FULL-HAND frame: gT:[1,0], nR:[1], pC:{each id:{cards:[2 x {value:null|mine, showing:false}],name1:null,...,prob1:null}}, oTC:{"1":[]},
          status:"inProgress", iHPI, wBACPI:[bbId], tB:{sb:10,bb:20}, cHB:20, mR:40, gN, hI, pGS:{id:"inGame"}, dealerID, dealerSeat, sBPI, bBPI,
          cPI/pITT/pASA/dLTWoTB/dLTWTB, sNA:"FCPFS", sNAA=now+20000, players:{id:{nPY:"<D>"}}
Server -> gC {now, sNAA = dLTWTB}   (time bank adjust)
Later hands start automatically at sNAA of the previous result (aD=true) or on owner "Next Hand »" / Enter (action NH).
```
### 8.4 A betting round
```
(actor A)   click Call/Check/Fold/Raise -> updateIntendedAction -> emit action {type:"PLAYER_CALL"} (or PLAYER_RAISE {value})
Server -> gC {pTB?, wBACPI, sNA:"NSAA"|"NSAF", sNAA:now+800, cRPI:[..A], tB:{A:amount|"check"}, pGS:{A:"fold"|"allIn"|{}} , pITT:null}
  +0.8 s -> gC {sNA:"FCPFS", sNAA:now+20000, cPI:B, pITT:B, pASA, mAVTB?, dLTWoTB, dLTWTB}
  +0.28 s -> gC {sNAA:dLTWTB}
End of street (all matched): gC {gT:[1,n], oTC:{"1":[..all board so far]} (array replaced), pot:+, players:{id:{stack}}, cHB:0, cRPI:[], tB:{id:"<D>"...}, mR:BB, cPI, pITT, pASA, dLTWoTB...}
Everyone folds: gC {gT:[1,5], pC:{...:{}}, pot:0, players:{winner:{winCount+1,stack}}, sNA:"NSAGR", sNAA:now+2900, tB cleared, gameResult:{winner:{gained,position:1}}}
```
### 8.5 Showdown (no all-in run-out)
```
River betting done -> gC {gT:[1,5], pC:{A:{cards:[{value,showing:true},..],name1:"straight",...}, B:{...}}, (muckers get {}), pot:0, players:{winner:{winCount,stack}},
        tHC:[winning board cards], sNA:"NSAGRS", sNAA:now+8000, gameResult:{winner:{"1":{hC:[cards used from hole],position:1},gained:120}}}
After sNAA: next-hand frame resets gT:[1,0], oTC:{"1":[],"2":"<D>"}, gameResult:"<D>", rHC:"<D>".
Post-hand: buttons Show (s / 1 / 2) for my own un-shown cards until sNAA-600 -> action SHOW_HAND{cardToShow}
```
### 8.6 Run it twice
```
Everyone all-in/only one with chips, cards must be revealed:
 gC {directToNexTurn:true, sNA:"NSARD", sNAA:now+10000, wRITD:true, rITD:{}, pGS:{...}, cPI:null, pITT:null}     (banner + "Run it Twice?" Yes/No for players still in; 10 s countdown)
 client -> action {type:"DRITD", decision:true|false}    (pref defaultRunItTwice auto-answers immediately)
 gC {rITD:{pid:true}} ... each vote   (unanimous yes is required [INF: observed 2 yes of 2 live players -> run twice])
 gC {nR:[2,0], oTC:{"2":[]}, sNA:"NSAA", sNAA:now+800, wRITD:"<D>", rITD:"<D>"}
 gC {pC:{id:{cards:[showing:true values],prob1:11.4...}}, pot, players stacks, sNA:"NSAAD", sNAA:now+4000, tB cleared}        <- reveal + equity for run 1
 gC {gT:[1,1], oTC:{"1":[flop]}, pC:{id:{name1,prob1}}, sNAA:+4000} ; gT:[1,2] turn ; gT:[1,3] river   (4 s each)
 gC {gT:[2,1], oTC:{"2":[flop2]}, pC:{id:{prob1,name2:"pair (6)"}}} ; [2,2] ; [2,3]      <- run 2 (second board rendered on a second row)
 gC {gT:[2,5], gameResult:{id:{"1":{hC,position:1},"2":{hC,position:1},gained:2120}}, sNA:"NSAGRS", sNAA:+8000}
If votes are not unanimous / window expires -> `wRITD:"<D>"`, `rITD:"<D>"` with nR unchanged ([1]) and a single run-out (observed 2 times).
Equity % (prob1) and hand names are 100 % server-side; client rounds and prints. Bar/percentage shown only when cards are showing.
```
### 8.7 Rabbit hunt
```
Hand ends (sNA:"NSAGR(S)", rH:true, board < 5 cards, rHC null) -> client shows reveal button (hotkey h) of width 4.61rem*N + .29rem*(N-1) + .5rem under the board
 client -> action {type:"RUC"}
 Server -> all: gC {rHP:[pid,...], sNAA += ~3 s (observed +3000 to the pending next-hand time), rHC:null}   -> everyone sees banner "Some players are seeing the undealt cards."
 Server -> requester(s) [INF]: gC {rHC:{"1":[remaining cards]}, pC:{id:{name1RH,name2RH}} }  ("(RH: ...)" text); client appends rHC to oTC[1] with class `rabbitHuntingCard` (semi-transparent), flips them with the 150 ms rule
 next hand frame: rHP:[], rHC:"<D>"
```
Cards of the hunted board are NOT visible to non-requesters in a spectator capture (`rHC` stayed null) [OBS]; exact `rHC` frame shape **[UNK - needs a hand where a captured client presses RUC]**.
### 8.8 Reconnect
```
network drop / ping timeout (pong not received within 5 s of ping)  -> client "disconnected" state
socket.io backoff 1 s .. 5 s (jitter .5), query: firstConnection removed, loadedCampaignId=<campaignId>
 reconnect -> 0{sid..}, 40 -> 42["registered", FULL snapshot incl. current hand, your own hole cards, timers]   (observed on a mid-hand join: gT:[1,0], pC with null values for others, sNAA set)
client replays snapshot; board cards appear already flipped (no animation), action timers resume from sNAA / dLTWTB using fresh sN offset.
If frame chain breaks during play: client emits action RUP and applies the full frame it gets back.
```

---
## 9. Hotkeys and local storage
Hotkeys (library = a `KeyboardEventHandler`-style component; every shortcut is ignored on mobile (`isMobile`) and while shortcuts are globally disabled, which is done whenever a modal/popover/chat input/other screen is open; `skipGlobalLock` for `+`) **[CODE]**:
`k` check, `c` call, `r` bet/raise (opens bet panel), `f` fold, `i` check-or-fold, `t` activate time bank, `Enter` next hand (owner button "Next Hand »"), `m` open chat, `l` open log, `b` toggle big-blind display of values (posts auto chat message `You are now seeing the values as big blinds, to toggle it, press b`), `s` show all cards after hand, `1`/`2` show first/second card, `p` pause/unpause (owner), `h` rabbit-hunt reveal, `u` toggle mic, `v` toggle camera, `+` add blind level (config form), `Esc` closes modal/panel/alert (document keydown, keyCode 27), bet panel Enter submits the form.
Buttons are throttled via a `Button` wrapper (`interval` per button, e.g. Yes/No 190 ms, away 300 ms, pause 400 ms, next hand 400 ms): ignores re-clicks inside that interval.

localStorage keys **[CODE]** (all reads/writes wrapped in try/catch; nothing sensitive):
- `currentPlayer` = JSON of local preferences `{sound:"med", deckStyle:"two-color", autoActivateTimeBank:true, showPromotionalAnnouncements:true, showDefaultDesignTheme:true, showQuickAcceptPlayer:true, showSuggestedGesturePopover:true, showVideoVoiceChatWarning:true, version:1, ...}`; other preference keys written there: `displayValueStyle` (`formatted` | `big-blind` | `none`), `nonBBDisplayValueStyle`, `previousDisplayValueStyle`, `showValueAsBB`, `hideGestures`, `hideBadges`, `hideAchivementBadges`, `hideMoodEmojis`, `defaultRunItTwice` (bool, auto-answer), `disableSecondarySounds`, `disableChatMessageBeep`, `notShowHandNotification`, `tournamentGuestsMuted`, `notifyWhenGettingASeatFromWaitlist`, `currentVideoDeviceID`, `currentAudioDeviceID`.
- `presets` (saved bet presets), `acceptedTOS` (home page TOS gate), `bkp-chatMessage` (unsent chat draft), `last-maintenance-m`, `shownAnnouncementsIds` (comma list), `seenDefaultDesignThemeNotice`, `feedback-auto-m-off`, `last-feedback-auto-m`, `highlights-auto-m-off`, `last-highlights-auto-m-envelope`, `tvp-offered-games`, `lastSentGestures:<gameId>`. Cookie `pn_login_door` (30 min) only for account login flow. No game state is cached in storage.

---
## 10. Front-end stack fingerprints
- React **16.14.0** (class components, legacy `contextTypes`/`getChildContext`, `shouldComponentUpdate` with deep-equal), `react-dom` render into `#main-container`; webpack 5 (`webpackChunkpokernow`, content-hashed bundles named `<entry>.bundle-<hash>.js`, runtime split), Babel-transpiled to ES5 (regenerator-runtime, core-js 2.6.9).
- Real-time: socket.io-client 2.x over engine.io-parser 2.x (utf8 2.1.2). HTTP: axios. Sound: Howler 2.0.x. Deep-merge + `<D>` delete sentinel is an in-house module; deep-equal lib for sCU. Video/voice: livekit-client 2.1.0 (out of scope). Payments: stripe-js 1.48 / react-stripe-js 1.16.5 (out of scope). Canvas lib fabric.js 5.3.0 (avatar/custom felt editing). Emoji: emoji-mart (google set) for mood emojis. Popper-based popovers, react-datepicker (schedule), react-select, Cloudflare Turnstile widget (log download, sign-in, table creation). GTM `GTM-NGW4TXS`, GA4 `G-6XKYK79KZ9`.
- Fonts: custom icon fonts `Suits` (class `su su-hearts|diamonds|clubs|spades`) and `Utils` (class `u u-up|u-down|u-config|u-fullscreen|u-times-circle|u-commenting|u-seat|u-volume-*|...`); Google Fonts Roboto, Josefin Sans 700, Mulish 700 on pages. (do not copy font files).

## 11. CSS structure (game page)
- Scaling model **[CODE]**: `#canvas` fills the viewport; JS sets `html { font-size = 0.032 * canvasHeight px }` on every ResizeObserver tick (so 1rem = 3.2 % of height, i.e. the whole table is a rem-based canvas that scales with viewport height) and `--table-design-system-zoom = 16 / min(rootFontPx, 26)` (used to keep fixed UI such as modals/forms at a sane size). `html` gets class `landscape` or `portrait` (mobile: `screen.orientation.type`; desktop: `(orientation: portrait)` media query). `#canvas.expanded` when mode "expanded" and landscape. iOS: layout height frozen while a text field has focus. Because everything is in rem, layout = designed for ~one aspect and positioned with absolute %/rem; only 4 media queries exist in the game CSS (`max-width:600px` x3, `max-width:480px`, `min-aspect-ratio:16/9`, `min-aspect-ratio:1/1.8`).
- Class naming: flat kebab-case, no BEM/CSS-modules/hash suffixes: `.game-column`, `.game-main-container`, `.table-cards.run-1/.run-2`, `.time-to-talk > .time-bank/.normal-time(.red)`, `.game-decisions-ctn(.low)`, `.button-1.action-button.(green|red|gray|dark-gray).highlighted.with-tip`, `.raise-controller-form`, `.default-bet-button`, `.show-hand-buttons`, `.rit-container`, `.reveal-button`, `.player-name`, `.numbers-signal/.signal`, `.alert-1-container/.alert-1`, `.log-modal-entries .entry-ctn(.entry-fold...)`, `.player-ledger-table-aux-table`, `.table-warning-ctn.default-warning-ctn`, `.room-owner-paused`, `.next-hand-button`, `.global-modal-ctn`, `.connecting-warning`. Utility-like helpers: `.hidden-label`, `.with-tip`, `.small-button`, `.highlighted`.
- Custom properties (only the "system/modal" layer is tokenised; table drawing uses literal rem values): `--pn-surface #fff/#232323`, `--pn-subtle #f1f1f3/#333335`, `--pn-warning-soft/-line/-ink`, `--pn-text-xs .75rem, sm .84, md .94, base 1, lg 1.35, xl 1.75, 2xl 2.35`, `--pn-space-1..6 = .25/.5/.75/1/1.5/2.5rem`, `--pn-radius-xs .29rem, sm .5, md .625, lg .875, pill 999px`, `--pn-shadow-raise/pop/modal`, `--pn-on-danger`, `--pn-on-coin`, `--pn-accent-dark`, `--show-hand-button 1rem/.7rem`, `--suggested-gesture-popover-size 1/.8`, `--price-ctn-root-font-size`, `--table-design-system-zoom`. Dark variants are defined next to light (`prefers-color-scheme` or class).
- Felt and card back are images chosen from `gameData.tableUrls` (`d/ds/m/ms`) and `customCardsBackUrl`; deck style preference `two-color` (default) | four-color [UNK exact names]. Design theme (e.g. seasonal `halloween-2026`) overrides both.

---
## 12. What the owner/others need: summary of answers to the specific questions
- Does the server send other players' hole cards? **No** (null values, same for spectators and for the owner's view of others); only count of cards. Values arrive for everyone simultaneously at all-in reveal / showdown or on `SHOW_HAND`.
- Equity %? server `pC[id].prob1`, delivered in the reveal frame and each street delta while `directToNexTurn`; client rounds.
- Run-it-twice vs rabbit hunt: both fully server-driven; client only sends `DRITD` / `RUC`.
- Log/ledger: HTTP pull (`log_v3`, `players_sessions`), not socket.
- Time sync: per-frame `sN`, no RTT correction; countdowns from absolute deadlines (`sNAA`, `dLTWoTB`, `dLTWTB`).

## UNKNOWN / needs owner help
1. Exact `rHC` frame shape and which sockets receive it (needs a capture on a client that presses `RUC`; use `cap.mjs`-style CDP capture on a seated player while another agent holds the host lock). Also what `rIT` takes besides `"ask_players"` and whether unanimity is required (observed only unanimous-yes -> run twice; one case where seated all-in players did not all vote -> single run).
2. Meaning of `nPY`, `sBS`, `dSB`, `lE`, `aGC`, `aVC`, `cR`, `sG` flags (inferred by name only).
3. Payload of `PLAYER_RAISE` for an all-in short stack and the server's rejection behaviour (no error event observed; likely silent). Real `action` sends for fold/call/raise were not captured (all 5 observed `action` emits were `ATB`).
4. Chat event payloads were taken from code only (no chat sent during captures); emoji `me` payload shape unknown.
5. Disconnect/reconnect was not forced live (documented from code + the mid-hand `registered` snapshot).
6. Values of sNAA delays other than those listed (e.g. stop-game, rebuy prompts, break) not observed.
7. Deck style option names, tvDirector mode and club/lounge behaviour (out of scope).
8. Side effect to flag: my capture opened an additional tab in the host Chrome profile as the owner, which auto-fired the "activate time bank" action on the host seat several times (host `pTB` dropped to 0 in one hand). No other action was sent. Later captures used only an isolated incognito spectator.
