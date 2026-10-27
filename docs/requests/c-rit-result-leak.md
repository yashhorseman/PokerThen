# c-rit-result-leak - run-it-twice winner is exposed without showing (HIGH, FIXED in tree)
Found by `tests/security/s06a-rit-leak.mjs` (real server, scripted deck). Config: `runItTwice` on + `revealAllWhenNoAction` OFF; the run-1 loser wins run 2.
`award()` decided "who must show" with the RUN-1 board only. The run-2-only winner never got `showing:true`, yet `frame.result[id].runs["2"].hc` (sent to EVERY viewer) and the public log line `collected ... (combination: 9h, Ks, Kd, Kh, Kc)` printed his hole cards. They were also not in the fairness reveal (`exposed`), so reveal and log disagreed.
Status: applied by Phase C in `packages/engine/src/hand/flow.ts` (award): the "show if you beat/tie the best so far" test now runs for every run board.
```diff
-    const best: number[] = pots.map(() => -1);
-    for (const id of order) {
-      const sc = rankInfo(h, id, boards[0]!).score;
-      let shows = shownAlready(id);
-      pots.forEach((pt, i) => { if (pt.eligible.includes(id) && sc >= best[i]!) { shows = true; best[i] = Math.max(best[i]!, sc); } });
+    const best: number[][] = boards.map(() => pots.map(() => -1));
+    for (const id of order) {
+      let shows = shownAlready(id);
+      const scs = boards.map((bd) => rankInfo(h, id, bd).score);
+      boards.forEach((_bd, bi) => pots.forEach((pt, i) => { if (pt.eligible.includes(id) && scs[bi]! >= best[bi]![i]!) { shows = true; best[bi]![i] = Math.max(best[bi]![i]!, scs[bi]!); } }));
       ...
-      if (shownAlready(id)) pots.forEach((pt, i) => { if (pt.eligible.includes(id)) best[i] = Math.max(best[i]!, sc); });
+      if (shownAlready(id)) boards.forEach((_bd, bi) => pots.forEach((pt, i) => { if (pt.eligible.includes(id)) best[bi]![i] = Math.max(best[bi]![i]!, scs[bi]!); }));
```
Proof after fix: both players show (`shows a K♠, K♦.` line), result/log/reveal consistent (`s06a` PASS). Note for the owner: this changes the log (an extra `shows a` line) only in the corner case above.
