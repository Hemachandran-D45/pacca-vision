# 03 — Production settings and secrets (commands)

All production configuration lives in one local file, **`.env.prod`**. It is gitignored, kept out
of the image, and its template is `env.prod.example` at the repo root.
`scripts/deploy/prod-config.sh` pushes it:

- `secrets` puts the 7 secrets into Key Vault (this step)
- `apply` puts the settings and secret references on the app (04)

Your `.env` points at the **test** resources. `.env.prod` is production (`senderra-idp-rg`).

## 1. Terminal setup (once per terminal; 04 and 05 use these too)

```bash
cd ~/pacca-vision
az login                                   # choose the "Senderra IDP" subscription
az account set -s ce9a8c23-1d37-4e21-8db3-17b436b1bf6d
az extension add -n containerapp --upgrade
RG=pacca-idp-rg; ACR=paccaidpacr; ID=id-pacca-idp-web; KV=kv-pacca-idp-web; APP=ca-pacca-idp-web
```

## 2. Create `.env.prod`

```bash
cp env.prod.example .env.prod
```

👀 Open `.env.prod`:

- Fill **only `IVR_API_KEY`**, with the same value as in your `.env` (the IVR backend is shared).
- Leave the other secret lines empty.
- Check the plain settings. In particular, `PACCA_IVR_TRIGGER_ENABLED=true` lets staff place
  **real** IVR calls from production; set it to `false` to hide the button for now.

## 3. Push the secrets to Key Vault

```bash
bash scripts/deploy/prod-config.sh secrets
```

*One line per secret: "set (read from Azure / generated / from .env.prod)" or "already in Key Vault,
kept". Values are never printed.*

An empty secret line is filled like this, straight into Key Vault, never written to disk:

| Secret (Key Vault name)                           | Source                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `COSMOS_KEY` (`cosmos-key`)                   | `cosmos-senderra-idp` primary key                                                        |
| `AZURE_STORAGE_KEY` (`storage-key`)           | `senderraidpsa` **key2** (the Function App uses key1, so each can rotate alone)    |
| `OPENAI_API_KEY` (`openai-key`)               | `senderra-idp-fr` **key2** (key1 leaked)                                           |
| `SENDERRA_FUNCTION_KEY` (`function-key`)      | `func-senderra-idp-001` default host key                                                 |
| `PACCA_JWT_SECRET` (`jwt-secret`)             | generated once. Production has its own, so Vercel sessions do not work here                |
| `IVR_WRITEBACK_API_KEY` (`ivr-writeback-key`) | generated once. Production's IVR callback route is closed until the IVR team uses this key |
| `IVR_API_KEY` (`ivr-api-key`)                 | from `.env.prod` (cannot be looked up)                                                    |

Rerunning is safe: a generated secret that already exists is kept, so nobody is signed out and the
IVR key does not change.

## Settings reference

The 15 plain settings in `env.prod.example`:

| Variable                                                                                 | Production value                                                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `COSMOS_ENDPOINT` / `COSMOS_DATABASE` / `COSMOS_CONTAINER`                         | `https://cosmos-senderra-idp.documents.azure.com:443/` / `senderra-idp` / `documents`                         |
| `AZURE_STORAGE_ACCOUNT`                                                                | `senderraidpsa`                                                                                                   |
| `AZURE_FILES_SHARE_NAME`                                                               | `senderra-idp-share`, the share `func-senderra-idp-001` mounts. The code default `assets` does not exist here |
| `SENDERRA_DOCS_CONTAINER` / `SENDERRA_UPLOAD_RUN_ID`                                 | `docs-in` / `ui`                                                                                                |
| `SENDERRA_FUNCTION_URL`                                                                | `https://func-senderra-idp-001-hadkerc7ggh3b3g5.eastus-01.azurewebsites.net`                                      |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` / `OPENAI_API_VERSION` / `OPENAI_AUTH_HEADER` | `…senderra-idp-fr…/deployments/gpt-5.6-luna` / `gpt-5.6-luna` / `2024-06-01` / `api-key`                  |
| `PACCA_IVR_TRIGGER_ENABLED` / `IVR_TRIGGER_URL` / `IVR_TRIGGER_TIMEOUT`            | `true` or `false` / the IVR backend URL / `10`                                                                |

**Optional:** `COSMOS_SOLUTIONS_CONTAINER` (default `solutions`, partition key `/typeKey`), the
Solutions doc-type catalog. It must exist and be seeded (`pnpm seed:solutions`) in the production
Cosmos account, or every Solutions request fails. The Function App reads the same variable (senderra-idp-sol
`shared/config.py`): set it on both, or on neither.

**Already in the image:** `NODE_ENV=production`, `PORT=3000`.

**Deliberately not set:**

- `GITHUB_*`: only the unused Solutions V1 needs them, and they would put a personal write token in
  production.
- `VITE_*`, `VERCEL_*`, `BUILT_IN_FORGE_*`: build-time, Vercel-only or Manus-only.
- `LOG_ANALYTICS_WORKSPACE_ID`, `AZURE_CLIENT_ID`: wait for the Log Analytics Reader upgrade (README,
  *Access*). Then add both to `.env.prod`: `fadfa043-d802-4df3-8091-00ecbbc7d63f` and the
  identity's client ID.

Next: [04 — Build the image, create the app, apply the settings](04_build_and_deploy.md).
