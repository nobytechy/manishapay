#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ManishaPay — one-shot deployment script for cPanel hosts.
#
# Usage (from your laptop, ssh enabled on cPanel):
#   ./deployment/deploy.sh user@your-host.com /home/user/public_html /home/user/manishapay-api
#
# Args:
#   $1 — ssh target (user@host)
#   $2 — remote public_html for the SPA
#   $3 — remote directory for the Node API
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SSH_TARGET=${1:?ssh target required, e.g. user@example.com}
PUBLIC_HTML=${2:?remote public_html path required}
API_PATH=${3:?remote api path required}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Building frontend"
( cd "$ROOT/frontend" && npm ci && npm run build )

echo "▶ Uploading SPA → $SSH_TARGET:$PUBLIC_HTML"
rsync -avz --delete \
  --exclude='.htaccess' \
  "$ROOT/frontend/dist/" "$SSH_TARGET:$PUBLIC_HTML/"
rsync -avz "$ROOT/deployment/.htaccess" "$SSH_TARGET:$PUBLIC_HTML/.htaccess"

echo "▶ Uploading API → $SSH_TARGET:$API_PATH"
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.log' \
  "$ROOT/backend/" "$SSH_TARGET:$API_PATH/"

echo "▶ Installing API dependencies on remote host"
ssh "$SSH_TARGET" "cd $API_PATH && npm ci --omit=dev"

echo "▶ Restarting Node app (touch app.js for Phusion Passenger)"
ssh "$SSH_TARGET" "mkdir -p $API_PATH/tmp && touch $API_PATH/tmp/restart.txt"

echo "✅ Deployment complete."
echo "   • Front-end : https://$(echo $SSH_TARGET | cut -d@ -f2)/"
echo "   • API       : https://api.$(echo $SSH_TARGET | cut -d@ -f2)/health"
