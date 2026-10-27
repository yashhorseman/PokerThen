# INTEGRATION status (Phase A)  -  updated incrementally

## Done / verified (real server + real engine + real Chrome)
- Build OK; real server serves the built client; /start-game -> create -> invite link -> guest Sit -> Request -> owner Quick Accept -> Start Game -> hands play (desktop + iPhone-emulated context).
- Item 1 alert/confirm: ONE system (core/ui OverlayHost). menus/dialogs.tsx is now a thin adapter (showConfirm -> `{ok, checked}`).
  Bug found+fixed: menus.css `.pt-scrim{z-index:0}` overrode the core scrim so alerts were UNCLICKABLE on phone (chat input on top); core scrim is now `.pt-scrim.pt-overlay-scrim`.
- Item 2 hook signatures: W4 hooks already match W7's assumptions (useHotkey(key, fn, {enabled, skipGlobalLock}), useModalLock(active=true) hook, useTableData, Icon `clock`/`chat` exist). No change needed.
- Item 3 log_v3 oldest-first: LogModal already reverses (newest on top); verified in browser.
- Item 4 Edit Player: Seat menu now shows `Edit Player` for the owner -> `openEditPlayer(id)`.
- Item 5: `queued?: boolean` added to the ok variant of CommandResult (shared/engineApi.ts); router uses it for update_player/update_game/remove_player (remove_player now answers `{queued}`). Server does not synthesise fairness log lines (verified: engine emits them) and keeps the latest reveal per hand (Map.set).
- Item 6: removed the W4 controller auto-ATB; only W6 ActionArea sends ATB (once per turn).
- Item 7: TableScreen already mounts ConfigScreen/QuickAcceptHost/ChatDock/LogButton/TosBar/ConnectScreen; NewGame uses ScaledCanvas via glob (works in browser).
- Item 10 real-engine leak test: tests/e2e/scenarios/i-E10-leak-real-engine.mjs PASS (fold-win, all-in + run-it-twice with equity, flop fold-win + rabbit hunt; every WS frame and HTTP body scanned).
- Other bug fixed: sit popover of seat 2 rendered below seat 1 (z-index) -> clicks went to Alice's plate. CSS `:has()` raise.
- Item 8: docs/SPEC.md section 23 added (w2-spec-updates + confirmed frame semantics). W1 breaking proposals applied: #1 `table.blinds` and `table.spectatorCount` now REQUIRED in Frame, #2 `EngineApi.currentOrNextConfig/playerEdit` REQUIRED (engine implements both; fixtures/fake engine updated). NOT applied (churn): #3 required VM fields, #4 statusText, #5 drop registered.you, #6 FairnessUsage rabbit kind.
- Item 9 confirmed in a real browser against the real engine: displayed stack = stack - bet (980 after BB), pot "total N" correct, between-hands state (autoDeal off) = Next Hand button, folded cards [] for every viewer (asserted in E10).
- Item 11 load (tests/e2e/load-check.mjs, real engine, 5 tables x 10 sockets, 3 seated players + hand running per table): RSS 52 MB idle -> 62 MB; CPU 0.14 s per 20 s (0.7%). Note MAX_SOCKETS_PER_IP=20 placeholder (U-N1): friends behind one NAT share it; real tables need <= ~12 per household, fine, but raise if spectators pile up.
- BUG FIXED (engine): frame `turn.nextStepAt` was always the with-bank deadline, so the client showed "EXTRA TIME ACTIVATED" from the start of every turn and the client never sent ATB. Now nextStepAt = bankActive ? deadlineWithBank : deadlineNoBank. Verified by E7 (ATB sent exactly once, engine auto-folds after limit+bank+grace).
- BUG FIXED: TOS bar was partly hidden behind the canvas (z-index 10) -> 250 (it now also covers the lower seats' sit popover until "Got it!" is pressed; the e2e helper dismisses it first).
- E2E scenarios (npm run test:e2e): w3-E15, i-E01 create/join/play/log/edit-player, i-E02 ui all-in + RIT + equity (desktop+phone), i-E04 socket kill + graceful + SIGKILL restart mid-hand, i-E05 /verify PASS + tampered FAIL + CLI, i-E06 autoDeal off + queued config, i-E07 time bank/timeout, i-E08 pause/away/leave/stop, i-E10 real-engine leak test.

## Final state (this session)
typecheck, 756 unit tests, build and `npm run test:e2e` (10 scenarios) all green.
## Remaining / unknown (not fixed here)
- Phone (portrait): status box ("WAITING") overlaps the stack text of seated plates; Alice-side seat plates touch the right screen edge (equity pill clipped at 390 wide); fold X marker overlaps the name of folded plates. W6 geometry guesses; Phase B2 should compare with research/03.
- Desktop: expanded chat dock overlaps seat 2's plate at 1440x900 (W5 geometry, compare with research/02); "Extra Time Activated" pill hides the "Your Turn" label (matches SPEC bottom 4.1rem vs -1.2rem, verify live).
- Ledger/Players list mid-hand: Players screen "Playing with N stack" shows stack incl. the open bet; ledger STACK excludes it (table total 2970 mid-hand). PokerNow behaviour unknown.
- TOS bar covers the lower seats' sit popover until "Got it!" is pressed (same bar position as spec); MAX_SOCKETS_PER_IP=20 placeholder.
- Not exercised in a browser: rebuy flow, straddle, antes, spectator/god mode, 10-player table, blind levels, real phone keyboard.
