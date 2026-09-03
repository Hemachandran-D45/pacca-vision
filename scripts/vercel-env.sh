#!/usr/bin/env bash
# Push the Senderra IDP server secrets from .env.local into a Vercel project.
#
#   bash scripts/vercel-env.sh [environment]     # default: production
#
# Requires the Vercel CLI and a linked project (`npx vercel link`). Values are
# piped on stdin rather than passed as arguments, so nothing secret lands in
# shell history or the process list.
set -euo pipefail

ENVIRONMENT="${1:-production}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env.local at $ENV_FILE — copy env.example and fill it in first." >&2
  exit 1
fi

VARS=(
  COSMOS_ENDPOINT
  COSMOS_KEY
  COSMOS_DATABASE
  COSMOS_CONTAINER
  AZURE_STORAGE_ACCOUNT
  AZURE_STORAGE_KEY
  SENDERRA_DOCS_CONTAINER
  SENDERRA_UPLOAD_RUN_ID
)

for name in "${VARS[@]}"; do
  value="$(grep -E "^${name}=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  value="${value%\"}"; value="${value#\"}"
  if [[ -z "$value" || "$value" == "replace-me" ]]; then
    echo "skip  $name (not set in .env.local)"
    continue
  fi
  # Remove first so a re-run updates rather than erroring on an existing key.
  npx vercel env rm "$name" "$ENVIRONMENT" --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | npx vercel env add "$name" "$ENVIRONMENT" >/dev/null
  echo "set   $name -> $ENVIRONMENT"
done

echo
echo "Done. Redeploy for the new values to take effect:  npx vercel --prod"
