# c-ws-flood - every connect adds a permanent player record and a durable state write (MEDIUM, FIXED in tree)
`presence` created a `PlayerRec` for every token that connects (tokens are free: 50 random chars) and never removed it. 300 throw-away tokens grew state.json 2 KB -> 114 KB (374 B each; the owner's frame listed all 302 players); every connect/disconnect is also a full fsync'd state rewrite (51 connects/s measured locally, far worse on Azure Files), and WS upgrades had no rate limit (only concurrent sockets per IP).
Status applied: (1) `commands.ts` presence: a disconnecting pure watcher (no seat, status watching, no ledger sessions, not owner, not god-mode) is deleted again; (2) `requestIngress` rejects when 30 requests are already pending; (3) `Hub.onUpgrade` rate-limits upgrades per IP (`LIMITS.WS_UPGRADES_PER_WINDOW` 60 per 10 s, `limits.ts`). After: 300 tokens -> state.json 2009 -> 2011 B.
```diff
+      if (!cmd.connected && p.seat === null && p.status === "watching" && p.id !== s.ownerId && p.sessions.length === 0 && !s.godModeIds.includes(p.id)) { delete s.players[p.id]; s.order = s.order.filter((x) => x !== p.id); }
+      if (Object.values(s.players).filter((p) => p.status === "requestedGameIngress").length >= 30) return fail(400, { code: "too_many_requests" });
-    const tooMany = (this.perIp.get(ip) ?? 0) >= LIMITS.MAX_SOCKETS_PER_IP;
+    const tooMany = (this.perIp.get(ip) ?? 0) >= LIMITS.MAX_SOCKETS_PER_IP || !this.upgrades.hit(ip);
```
Open follow-up (LOW): presence still rewrites state.json on every connect/disconnect; coalescing presence writes (persist at most every 2 s) would remove the remaining fsync amplification.
