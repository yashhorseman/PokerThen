# c-chat-flood - chat is unthrottled per player and chat.jsonl grows forever (MEDIUM, FIXED in tree)
Measured: 10 throw-away watchers persisted 400 messages in 3.5 s (113 msg/s, 1.8 GB/day extrapolated), each an fsync; /healthz latency rose to 200 ms. Only a per-socket 40/2 s cap existed and watchers may chat while guestChat is on.
Status applied: `TableRunner.postChat` drops messages beyond `LIMITS.CHAT_PER_WINDOW` (6 per 5 s) per player, and stops appending to chat.jsonl after `LIMITS.CHAT_PERSIST_MAX` (20 000 lines per table; messages are still broadcast). After: 60 messages in the same flood, 0.3 GB/day.
```diff
+    const hits = (this.chatHits.get(sender) ?? []).filter((x) => x > now - LIMITS.CHAT_WINDOW_MS); hits.push(now); this.chatHits.set(sender, hits);
+    if (hits.length > LIMITS.CHAT_PER_WINDOW) return "ignored";
-      this.store.appendChat(JSON.stringify(rec));
+      if (this.chatCount < LIMITS.CHAT_PERSIST_MAX) { this.store.appendChat(JSON.stringify(rec)); this.chatCount++; }
```
Owner decision (U-N1): the 6/5 s numbers are placeholders like the other limits.
