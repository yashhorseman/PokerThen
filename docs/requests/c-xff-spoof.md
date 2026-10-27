# c-xff-spoof - per-IP limits trust the LEFTMOST X-Forwarded-For entry (MEDIUM, FIXED in tree)
`clientIp()` used the first entry. Azure's front end APPENDS the real client address to a client-supplied header (assumption: could not be verified without deploying; the rightmost entry is correct in both the append and the overwrite case). Any client can therefore rotate its apparent IP: the 20-sockets-per-IP cap, `/new-game` 10/min, the 120 POST/10 s and log limits were all bypassed (`s05-limits.mjs`: 30 sockets and 14 `/new-game` from one address, spoofed leading entries -> none refused).
Status: applied in `apps/server/src/security.ts`.
```diff
-/** Client IP: leftmost X-Forwarded-For entry ... */
-  let ip = (env.trustProxy ? first(req.headers["x-forwarded-for"]) : undefined) ?? req.socket.remoteAddress ?? "unknown";
+const last = (v) => { const s = Array.isArray(v) ? v.join(",") : v; const p = s?.split(",").map((x) => x.trim()).filter(Boolean); return p && p.length ? p[p.length - 1] : undefined; };
+  let ip = (env.trustProxy ? last(req.headers["x-forwarded-for"]) : undefined) ?? req.socket.remoteAddress ?? "unknown";
```
To verify on Azure after a deploy (owner asks): `curl -H 'X-Forwarded-For: 1.2.3.4' https://<app>/healthz` and log what the server sees.
