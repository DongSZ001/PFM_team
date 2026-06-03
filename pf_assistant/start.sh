#!/usr/bin/env bash
# PF Assistant server startup script.
#
# Loads SMTP / admin-notification / public-origin env vars and starts serve.js.
# To use:
#   1. cp start.env.example start.env  (or edit this file directly)
#   2. fill in real values
#   3. ./start.sh
#
# The script does NOT set NODE_ENV=production on purpose — the site is served
# over plain HTTP and Secure cookies would break login.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- load .env-style file if present ----
if [ -f "$SCRIPT_DIR/start.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/start.env"
  set +a
fi

# ---- required-for-email env vars (with safe defaults) ----
export SMTP_HOST="${SMTP_HOST:-smtp.qq.com}"
export SMTP_PORT="${SMTP_PORT:-465}"
export SMTP_SECURE="${SMTP_SECURE:-true}"
# SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_NOTIFY_EMAIL come from start.env
# (or environment). If SMTP_USER/PASS missing, mailer.js will log a warning
# and fall back to console-only notifications — registration still works.

export PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://47.93.53.231:3000/app}"
# Do NOT force production mode here — Secure cookies would break login over HTTP.
# export NODE_ENV=production  # intentionally left commented

mkdir -p logs

echo "[start] PUBLIC_ORIGIN=${PUBLIC_ORIGIN}"
echo "[start] SMTP_HOST=${SMTP_HOST} PORT=${SMTP_PORT} SECURE=${SMTP_SECURE}"
echo "[start] SMTP_USER=${SMTP_USER:-<unset>}"
if [ -n "${SMTP_PASS:-}" ]; then
  echo "[start] SMTP_PASS=<set, length=${#SMTP_PASS}>"
else
  echo "[start] SMTP_PASS=<unset>"
fi
echo "[start] ADMIN_NOTIFY_EMAIL=${ADMIN_NOTIFY_EMAIL:-<unset>}"

exec node serve.js
