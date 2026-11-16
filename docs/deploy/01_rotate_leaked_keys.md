# 01 — Rotate the leaked keys (optional for the deploy)

Two live keys were hardcoded in git history from `13da57e` until `71f038f` removed them. Removing
them from the code does not revoke them. See [Skipping 01](README.md#skipping-01-key-rotation) for why
the deploy does not wait for this.

| Leaked key | Used by |
|---|---|
| `paccavisionsa` key1 (test storage, `pacca-vision-rg`) | `func-pacca-vision-001` (3 settings + 2 file mounts), Vercel, local `.env` |
| `senderra-idp-fr` key1 (Azure OpenAI / CU, `senderra-idp-rg`) | `func-pacca-vision-001` and `func-senderra-idp-001` (`AOAI_KEY`, `CU_KEY`), Vercel, local `.env` |

Every user is on key1, so regenerating it first would take both pipelines down. The order is: move
everyone to key2, check, then regenerate key1.

## 1. Move the Function Apps to key2

```bash
OLD_SA=$(az storage account keys list -g pacca-vision-rg -n paccavisionsa --query "[0].value" -o tsv)
NEW_SA=$(az storage account keys list -g pacca-vision-rg -n paccavisionsa --query "[1].value" -o tsv)
OLD_AOAI=$(az cognitiveservices account keys list -g senderra-idp-rg -n senderra-idp-fr --query key1 -o tsv)
NEW_AOAI=$(az cognitiveservices account keys list -g senderra-idp-rg -n senderra-idp-fr --query key2 -o tsv)

# Replace key1 with key2 inside every app setting that contains it (one restart per app).
swap_keys() {  # $1 = function app, $2 = resource group
  mapfile -t S < <(az functionapp config appsettings list -n "$1" -g "$2" -o json | jq -r \
    --arg o1 "$OLD_SA" --arg n1 "$NEW_SA" --arg o2 "$OLD_AOAI" --arg n2 "$NEW_AOAI" \
    '.[] | select(.value != null and ((.value|contains($o1)) or (.value|contains($o2))))
         | "\(.name)=\(.value | split($o1) | join($n1) | split($o2) | join($n2))"')
  [ ${#S[@]} -eq 0 ] && { echo "$1: nothing to change"; return; }
  az functionapp config appsettings set -n "$1" -g "$2" --settings "${S[@]}" -o none
  printf '%s: updated %s\n' "$1" "$(printf '%s ' "${S[@]%%=*}")"
}
swap_keys func-pacca-vision-001 pacca-vision-rg
swap_keys func-senderra-idp-001 senderra-idp-rg

# The Azure Files mounts on the test Function App hold their own copy of the storage key.
for m in assetsmount assets-mount; do
  az webapp config storage-account update -g pacca-vision-rg -n func-pacca-vision-001 \
    --custom-id $m --access-key "$NEW_SA" -o none
done
```

## 2. Everyone else

- **Vercel** (Hemachandran): set `AZURE_STORAGE_KEY` and `OPENAI_API_KEY` to the key2 values in
  every environment and redeploy. **This must happen before step 4.**
- **Your `.env`** and anyone else's local files, scripts or GitHub secrets that hold either key.

## 3. Check

Upload one PDF on the Vercel link and watch it reach *Processed*. Then check the test Function App's
log for storage errors:

```bash
az webapp log tail -g pacca-vision-rg -n func-pacca-vision-001
```

## 4. Regenerate key1

```bash
az storage account keys renew -g pacca-vision-rg -n paccavisionsa --key primary -o none
az cognitiveservices account keys regenerate -g senderra-idp-rg -n senderra-idp-fr --key-name Key1 -o none
```

key1 is now the spare. Next time, rotate the other way round.
