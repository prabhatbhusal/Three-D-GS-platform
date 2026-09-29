#!/usr/bin/env bash
# Runs ON the VPS from the app checkout, after `git pull` (CI does both; see
# deploy/README.md). The live site keeps serving .next while the new build
# goes into .next-new; a failed build changes nothing that is running.
set -euo pipefail
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund
npm ci --prefix server --omit=dev --no-audit --no-fund

rm -rf .next-new
NEXT_DIST_DIR=.next-new npm run build
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-new .next

pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save
echo "deployed $(git rev-parse --short HEAD)"
