#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
export PFM_ENABLE_FERRO_LANDAU_EDITOR=1

URL="http://127.0.0.1:4318"
echo "Starting ferro Landau editor at ${URL}"
node tools/ferro-landau-editor/server.js &
PID=$!

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${URL}" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "${URL}" >/dev/null 2>&1 || true
fi

wait "${PID}"
