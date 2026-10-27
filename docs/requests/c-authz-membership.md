# c-authz-membership - read endpoints do not check table membership (LOW; NOT applied)
ARCH 5.1 says "any in game" (a cookie whose player id is known to the table) for ledger, log, CSV and config reads, but `need()` only checks that a well-formed token exists, so a token that never joined can read them if it knows the 126-bit game id (`s03-authz.mjs`). The link is also what lets anyone join as a watcher, so the practical risk is nil; align code with the contract anyway:
```diff
   const need = (req: IncomingMessage): Me => {
     const me = identify(req, env);
     if (!me) throw new HttpError(403, { code: "missing_game_player" });
     return me;
   };
+  const member = (t: TableRunner, me: Me): void => { if (engine.playerName(t.state, me.id) === null) throw new HttpError(403, { code: "missing_game_player" }); };
```
and call `member(t, me)` in the log_v3, players_sessions, current_or_next_configs, CSV and players/:pid routes after `table(...)`. (Fairness stays public by design.) Check that the web client always opens the WS before calling these routes (the engine creates the watcher record on connect).
