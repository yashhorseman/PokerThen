# W1 request (breaking, NOT applied; for architect arbitration)

Everything below was added as OPTIONAL/additive on 2026-10-26 (see CHANGES.md). Making them required would break builders already coding, so it is proposed, not done.

1. `Frame.table.blinds` (current blind level `{sb,bb,ante,level}`) and `Frame.table.spectatorCount` should become REQUIRED; today clients must fall back to `config.blindLevels[0]` / count watchers. Engine (W2) must fill them; W4 then drops fallbacks.
2. `EngineApi.currentOrNextConfig` and `EngineApi.playerEdit` should become REQUIRED (server routes GET current_or_next_configs and GET players/:pid cannot work without them). Today optional so W2/W3 fakes still typecheck.
3. `TableViewModel.you`, `.configQueued`, `.rebuy` and `TableDataApi` (new, shared/viewModel.ts) should become REQUIRED parts of the VM/hooks contract (`useTableData()` in core/hooks.ts); without them W7 has no way to load log/ledger/config/edit-player without calling fetch.
4. `PlayerVM.statusLabel` cannot express `Offline & Away` or `FOLD (OFFLINE)`; proposal: replace `PlayerStatusLabel`+`statusSuffix?` by one `statusText: string | null` (final display text per SPEC 4.5/19). Breaking for W4/W5.
5. `ServerMsg.registered.you` duplicates `Frame.you` (and lacks isOwner); proposal: drop `you` from `registered` and from `igpu` consumers use `frame.you`. Breaking for W3/W4.
6. `FairnessUsage.kind` has no separate `rabbit` kind; additive `rabbit?: boolean` used instead. Proposal: widen kind to include "rabbit" (breaks exhaustive switches in W2/W8).
