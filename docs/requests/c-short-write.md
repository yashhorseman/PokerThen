# c-short-write - short write on a full disk tears state.json / log lines and the table is lost (HIGH, FIXED in tree)
Found by `tests/security/s08-crash.mjs` (real server under RLIMIT_FSIZE = disk-full shape: writes crossing the limit are short, later ones fail EFBIG).
`fsio.ts` called `writeSync(fd, data)` once and ignored the returned byte count. A short write produced a truncated `state.json.tmp`, which was then `rename`d over the good `state.json`; every command was acknowledged 200 (13/13), and after a restart the table was QUARANTINED (hand, chips and fairness chain gone). Same hole for `appendDurable` (torn JSONL line acked as success).
Status: applied in `apps/server/src/persistence/fsio.ts`: `writeAll()` loops until all bytes are written and throws on no progress; `writeAtomic` removes the tmp file on failure and never renames a partial file; the existing rollback in `TableStore.commit` then rejects the command with 503 and state does not advance.
```diff
+function writeAll(fd: number, text: string): void {
+  const buf = Buffer.from(text, "utf8"); let off = 0;
+  while (off < buf.length) { const n = writeSync(fd, buf, off, buf.length - off); if (n <= 0) throw new Error("short write: no progress"); off += n; }
+}
-      writeSync(fd, lines.map((l) => l + "\n").join(""));
+      writeAll(fd, lines.map((l) => l + "\n").join(""));
-    try { writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
+    try { writeAll(fd, data); fsyncSync(fd); } catch (e) { try { closeSync(fd); } catch {} try { rmSync(tmp, { force: true }); } catch {} throw e; }
+    closeSync(fd);
     renameSync(tmp, file);
```
After: statuses `200,503`, state.json valid, table recovered after SIGKILL.
