# Deploying to Azure App Service

Existing resources (from the hosting brief): subscription `3da7bea5-43c8-40a1-b1ae-8252398e9507`, resource group `pokerthen-rg`,
web app `pokerthen-yash` (Linux, Node 22, Central India, Basic B1, **one instance**),
URL `https://pokerthen-yash-hxeyf6g0g7bpbrh5.centralindia-01.azurewebsites.net`.
Trial credit expires around **24 November 2026** — deleting `pokerthen-rg` removes everything.

Settings that must be on (verify): Web sockets, Always On, HTTPS only, ARR session affinity **off**, startup command `node server.cjs`,
app setting `SESSION_SECRET` (random; never commit/print), `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `WEBSITE_NODE_DEFAULT_VERSION=~22`.

The server listens on `process.env.PORT`, stores tables as JSON under `/home/data` (the only persistent path; chosen automatically
when `WEBSITE_SITE_NAME` is set, or set `DATA_DIR`), sends/expects application pings every 20 s, checks `Origin` on WebSocket upgrades
(extra origins: `ALLOWED_ORIGINS`), and trusts `X-Forwarded-*`. Keep exactly one instance (state is in memory + `/home`).

## Steps
```bash
npm ci && npm run build
cd dist/app && zip -qr ../app.zip . && cd ../..
az webapp deploy -g pokerthen-rg -n pokerthen-yash --src-path dist/app.zip --type zip
curl https://pokerthen-yash-hxeyf6g0g7bpbrh5.centralindia-01.azurewebsites.net/healthz
az webapp log tail -g pokerthen-rg -n pokerthen-yash
```
The first deploy replaces an older build that wrote a different data format: clear the old files under `/home/data` first.
(`az` prints harmless Python SyntaxWarnings. If `az` says you are not logged in, run `az login` yourself.)
