#!/usr/bin/env bash
# Full browser QA: every button, against a local PalGate stand-in. Usage: npm run qa
set -euo pipefail
cd "$(dirname "$0")"
node palgate-mock.cjs > mock.log 2>&1 &
MOCK=$!
STATE="state-$(date +%s)"
NO_PROXY=127.0.0.1,localhost npx wrangler dev -c wrangler.qa.toml --port 8799 --persist-to "$STATE" > wrangler.log 2>&1 &
DEV=$!
trap 'kill $MOCK $DEV 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s localhost:8799/ > /dev/null && break; sleep 1; done
node qa.cjs
