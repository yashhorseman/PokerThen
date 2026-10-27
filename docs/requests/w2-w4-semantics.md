# W2 -> W4 frame semantics (confirmed)
- `players[id].stack` = engine stack + the player's open street bet (`hand.bets[id]` number), so `stack - currentBet - gained` is the displayed stack. After the award tick bets are empty and `stack` already includes the winnings (`result[id].gained`).
- `pot.totalText`: engine only supplies `hand.pot` (collected from previous streets) and `hand.bets`; "total N" = pot + sum(numeric bets) is computed client-side.
- Between-hands waiting (auto-deal off): `result !== null` and `turn.nextStep === null` and `table.waitingMessage` is set; during the result window `nextStep` is NSAGR/NSAGRS.
- Time bank: the engine acts at `deadlineNoBank` (+1.5 s grace) unless the client sent action `ATB`; with `ATB` it acts at `deadlineWithBank`. The client must send ATB when the limit expires and pref autoActivateTimeBank is on (live: 08 e).
- Folded players' `cards` is `[]` for every viewer (SPEC 21), including themselves, unless they showed.
