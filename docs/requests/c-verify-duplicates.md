# c-verify-duplicates - CLI / shared verifyReveal accepts a non-permutation deck (LOW fairness; NOT applied)
`packages/shared/src/fairness.ts verifyReveal` (used by `scripts/verify-hand.ts`) flags only "same INDEX twice with different values". A server that commits to a deck with a repeated card (e.g. two A♠, valid proofs, valid commitment) PASSES when both copies are exposed. The /verify page (`pages/verify/check.ts`) already catches it; the CLI must too (`s07-fairness.mjs`: all 15 other tampers - card, salt, proof, root, prevCommitment, commitment, index, handId, gameId, log lines - are caught by both).
```diff
   const byIndex = new Map<number, string>();
-  let wellFormed = true; let dup = false;
+  const byCard = new Map<string, number>(); let wellFormed = true; let dup = false;
   for (const r of rev.cards) {
     ...
     byIndex.set(r.index, r.card);
+    const at = byCard.get(r.card); if (at !== undefined && at !== r.index) dup = true; byCard.set(r.card, r.index);
   }
-  checks.push({ id: "cards", ok: wellFormed && !dup, detail: dup ? "A deck index is revealed twice with different values." : ...
+  checks.push({ id: "cards", ok: wellFormed && !dup, detail: dup ? "A deck index (or a card) is revealed twice with different values." : ...
```
Trust anchor (design note, LOW): the CLI compares the reveal with the commitment the SAME server serves now. Add `--commitment <hex> --prev <hex>` flags to `scripts/verify-hand.ts` so a player can pass the commitment they saw in the hand log before the hand (a rewritten history is then caught); the web page already checks the log line. Residual (documented limit): without an external copy of an earlier commitment the operator can recompute the whole chain; players should keep the commitment of the last hand they saw.
