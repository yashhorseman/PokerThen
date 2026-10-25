#!/usr/bin/env bash
# Build, package and deploy to Azure App Service. Requires `az login` and the app to exist.
#   RG=pokerthen-rg APP=pokerthen-yash npm run deploy
set -euo pipefail
cd "$(dirname "$0")/.."
RG="${RG:-pokerthen-rg}"
APP="${APP:-pokerthen-yash}"

npm run package
az webapp deploy -g "$RG" -n "$APP" --src-path .artifacts/pokerthen.zip --type zip --timeout 300000
HOST=$(az webapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)
echo "Deployed. Checking https://$HOST/healthz"
sleep 8
curl -fsS "https://$HOST/healthz" && echo
