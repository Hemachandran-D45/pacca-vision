#!/usr/bin/env bash
# Push production configuration from .env.prod to Azure.
#
#   bash scripts/deploy/prod-config.sh secrets [ENV_FILE]   # 7 secrets -> Key Vault
#   bash scripts/deploy/prod-config.sh apply   [ENV_FILE]   # secrets + settings -> container app
#
# ENV_FILE defaults to .env.prod at the repo root (gitignored; template: env.prod.example).
# Needs `az login` and, for `apply`, the containerapp extension. Resource names default to
# docs/deploy and can be overridden: RG KV ID APP DATA_RG FUNCTION_APP.
#
# Secret values are never printed and never passed on the command line: they go to az through
# a file descriptor, so they do not show up in `ps` or shell history.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CMD="${1:-}"
ENV_FILE="${2:-$ROOT/.env.prod}"

RG="${RG:-pacca-idp-rg}"
KV="${KV:-kv-pacca-idp-web}"
ID="${ID:-id-pacca-idp-web}"
APP="${APP:-ca-pacca-idp-web}"
DATA_RG="${DATA_RG:-senderra-idp-rg}"
FUNCTION_APP="${FUNCTION_APP:-func-senderra-idp-001}"

# Container env var -> Key Vault secret name. Order is the order they are reported in.
SECRET_VARS=(COSMOS_KEY AZURE_STORAGE_KEY OPENAI_API_KEY SENDERRA_FUNCTION_KEY IVR_API_KEY IVR_WRITEBACK_API_KEY PACCA_JWT_SECRET)
secret_name() {
  case "$1" in
    COSMOS_KEY) echo cosmos-key ;;
    AZURE_STORAGE_KEY) echo storage-key ;;
    OPENAI_API_KEY) echo openai-key ;;
    SENDERRA_FUNCTION_KEY) echo function-key ;;
    IVR_API_KEY) echo ivr-api-key ;;
    IVR_WRITEBACK_API_KEY) echo ivr-writeback-key ;;
    PACCA_JWT_SECRET) echo jwt-secret ;;
  esac
}
is_secret() { local v; for v in "${SECRET_VARS[@]}"; do [[ "$v" == "$1" ]] && return 0; done; return 1; }

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
die() { echo "error: $*" >&2; exit 1; }

[[ "$CMD" == "secrets" || "$CMD" == "apply" ]] || usage
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy env.prod.example to .env.prod and fill it in."

# Parse KEY=value lines the way server/loadLocalEnv.ts does: skip blanks and comments, strip one
# pair of surrounding quotes. Values may contain '='.
declare -A CONF=()
ORDER=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line#"${line%%[![:space:]]*}"}"; line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
  key="${line%%=*}"; key="${key%"${key##*[![:space:]]}"}"
  value="${line#*=}"; value="${value#"${value%%[![:space:]]*}"}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
  [[ -v CONF[$key] ]] || ORDER+=("$key")
  CONF[$key]="$value"
done < "$ENV_FILE"

conf() { echo "${CONF[$1]:-}"; }
host_label() { local h="${1#*://}"; h="${h%%/*}"; echo "${h%%.*}"; }   # https://a.b.c/x -> a

kv_has() { az keyvault secret show --vault-name "$KV" -n "$1" --query value -o tsv >/dev/null 2>&1; }

# Where an empty secret comes from. Prints the value on stdout; returns 1 if it cannot.
lookup() {
  case "$1" in
    COSMOS_KEY)
      local account; account="$(host_label "$(conf COSMOS_ENDPOINT)")"
      [[ -n "$account" ]] || return 1
      az cosmosdb keys list -n "$account" -g "$DATA_RG" --query primaryMasterKey -o tsv ;;
    AZURE_STORAGE_KEY)
      # key2: the Function App uses key1, so each key has one consumer (docs/deploy/03).
      [[ -n "$(conf AZURE_STORAGE_ACCOUNT)" ]] || return 1
      az storage account keys list -n "$(conf AZURE_STORAGE_ACCOUNT)" -g "$DATA_RG" --query '[1].value' -o tsv ;;
    OPENAI_API_KEY)
      # key2 always: key1 leaked (docs/deploy/README.md, "Skipping 01").
      local resource; resource="$(host_label "$(conf OPENAI_BASE_URL)")"
      [[ -n "$resource" ]] || return 1
      az cognitiveservices account keys list -n "$resource" -g "$DATA_RG" --query key2 -o tsv ;;
    SENDERRA_FUNCTION_KEY)
      az functionapp keys list -n "$FUNCTION_APP" -g "$DATA_RG" --query functionKeys.default -o tsv ;;
    PACCA_JWT_SECRET) openssl rand -base64 48 | tr -d '\n' ;;
    IVR_WRITEBACK_API_KEY) openssl rand -hex 32 ;;
    *) return 1 ;;
  esac
}

push_secrets() {
  local var name value source
  for var in "${SECRET_VARS[@]}"; do
    name="$(secret_name "$var")"
    value="$(conf "$var")"
    if [[ -n "$value" ]]; then
      source="from $(basename "$ENV_FILE")"
    elif kv_has "$name"; then
      echo "  $name: already in Key Vault, kept"
      continue
    elif value="$(lookup "$var")" && [[ -n "$value" ]]; then
      case "$var" in
        PACCA_JWT_SECRET|IVR_WRITEBACK_API_KEY) source="generated" ;;
        *) source="read from Azure" ;;
      esac
    else
      die "$var is empty in $(basename "$ENV_FILE"), not in Key Vault, and cannot be looked up. Set it in $(basename "$ENV_FILE")."
    fi
    if [[ "$var" == "PACCA_JWT_SECRET" && ${#value} -lt 32 ]]; then
      die "PACCA_JWT_SECRET must be at least 32 characters."
    fi
    az keyvault secret set --vault-name "$KV" -n "$name" --file <(printf '%s' "$value") --encoding utf-8 -o none
    echo "  $name: set ($source)"
  done
  echo "Done. Key Vault $KV holds all ${#SECRET_VARS[@]} secrets."
  if ! [[ -n "$(conf IVR_WRITEBACK_API_KEY)" ]]; then
    echo "The IVR team will need ivr-writeback-key when they call production:"
    echo "  az keyvault secret show --vault-name $KV -n ivr-writeback-key --query value -o tsv"
  fi
}

apply_app() {
  local identity var name refs=() envs=()
  identity="$(az identity show -g "$RG" -n "$ID" --query id -o tsv)" || die "identity $ID not found in $RG."
  for var in "${SECRET_VARS[@]}"; do
    name="$(secret_name "$var")"
    refs+=("$name=keyvaultref:https://$KV.vault.azure.net/secrets/$name,identityref:$identity")
    envs+=("$var=secretref:$name")
  done
  for var in "${ORDER[@]}"; do
    is_secret "$var" && continue
    envs+=("$var=${CONF[$var]}")
  done
  local before after
  before="$(az containerapp show -g "$RG" -n "$APP" --query properties.latestRevisionName -o tsv)"
  echo "Adding ${#refs[@]} Key Vault references to $APP..."
  az containerapp secret set -g "$RG" -n "$APP" --secrets "${refs[@]}" -o none
  echo "Setting ${#envs[@]} environment variables on $APP..."
  az containerapp update -g "$RG" -n "$APP" --set-env-vars "${envs[@]}" -o none
  after="$(az containerapp show -g "$RG" -n "$APP" --query properties.latestRevisionName -o tsv)"
  # Azure only creates a revision when a setting changed. A secret changed only in Key Vault
  # (e.g. a new IVR key) is read when a revision starts, so an unchanged revision keeps the old
  # value until it restarts. Restart it so a secret-only change takes effect now.
  if [[ "$before" == "$after" ]]; then
    echo "No setting changed, so no new revision; restarting $after to reload the Key Vault secrets..."
    az containerapp revision restart -g "$RG" -n "$APP" --revision "$after" -o none
  else
    echo "New revision $after."
  fi
  echo "Done. Check: az containerapp revision list -g $RG -n $APP -o table"
}

case "$CMD" in
  secrets) echo "Pushing secrets from $ENV_FILE to Key Vault $KV:"; push_secrets ;;
  apply) apply_app ;;
esac
