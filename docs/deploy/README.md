# Deploying PACCA IDP to Azure Container Apps

Production is **one container** (React UI + Express API, port 3000) in Azure Container Apps. The image
is in Azure Container Registry and the secrets are in Key Vault. Every web-app resource lives in its
own resource group, **`pacca-idp-rg`**; the data stays where it is.

**One rule for the whole guide:**
- **Create or configure an Azure resource → the Azure portal** (click steps).
- **Push something (image, secrets, settings) → a command** (one terminal, from the repo root).

| Step | What | How |
|---|---|---|
| [01](01_rotate_leaked_keys.md) | Rotate the leaked keys (optional; see below) | commands |
| [02](02_azure_resources.md) | Create the resource group, registry, identity and Key Vault | portal |
| [03](03_secrets_and_env.md) | Production settings and secrets (`.env.prod`) | commands |
| [04](04_build_and_deploy.md) | Build the image, create the app, apply the settings | commands + portal |
| [05](05_verify_update_rollback.md) | Verify, deploy new versions, roll back | commands + app checks |

## Environments

| | Test | Production (this guide) |
|---|---|---|
| Branch | `dev` | `main` |
| Web app | Vercel (Hemachandran's account) | `ca-pacca-idp-web` in **`pacca-idp-rg`** |
| Data plane | `pacca-vision-rg`: `cosmos-pacca-vision`, `paccavisionsa`, `func-pacca-vision-001` | `senderra-idp-rg`: `cosmos-senderra-idp`, `senderraidpsa`, `func-senderra-idp-001` |
| Shared by both | Azure OpenAI `senderra-idp-fr`, the IVR backend | |

Testing on Vercel never touches production documents. Both pipelines run the same function code and
the same 9 doc types. The web app only *reads keys* from `senderra-idp-rg`; it creates nothing there.

## Access: nothing needed from IT to go live

You have **Contributor** on the subscription. That covers every resource here, but not **role
assignments**. The design avoids them:

| Need | How | Upgrade later (IT grants a role) |
|---|---|---|
| App reads its secrets | Managed identity `id-pacca-idp-web` + Key Vault on **access policies** (a vault setting Contributor can write) | — |
| App pulls its image | The registry's **admin user** login, stored on the app | **AcrPull** for the identity, then turn the admin user off |
| Observability copilot's *Azure Monitor* tool | Not configured; the tool says so, and everything else works | **Log Analytics Reader** on `senderra-idp-log` |

Both upgrades are tracker §5. CI/CD will also need IT (tracker §4).

## Before you start: production data

👀 Portal → `cosmos-senderra-idp` → **Data Explorer** → `senderra-idp`:
1. **`users`:** production sign-in reads this container, not Vercel's. If it is empty, seed the three
   demo accounts:

   ```bash
   COSMOS_ENDPOINT=https://cosmos-senderra-idp.documents.azure.com:443/ COSMOS_DATABASE=senderra-idp \
   COSMOS_KEY="$(az cosmosdb keys list -n cosmos-senderra-idp -g senderra-idp-rg --query primaryMasterKey -o tsv)" \
   SEED_PASSWORD='<choose a strong one>' pnpm seed:users
   ```
2. **`documents`:** what is here is what production users see on day one (for example, old
   benchmark runs). Decide whether that is acceptable.

## Names

| Resource | Name | Resource group |
|---|---|---|
| Resource group | `pacca-idp-rg` | |
| Container registry | `paccaidpacr` | `pacca-idp-rg` |
| Managed identity | `id-pacca-idp-web` | `pacca-idp-rg` |
| Key Vault | `kv-pacca-idp-web` | `pacca-idp-rg` |
| Container Apps environment | `cae-pacca-idp` | `pacca-idp-rg` |
| Log Analytics workspace (app logs) | `log-pacca-idp` | `pacca-idp-rg` |
| Container app | `ca-pacca-idp-web` | `pacca-idp-rg` |

Region: **East US** for everything. If East US has no Container Apps capacity, the environment and
the app go to **East US 2** instead ([04 §2](04_build_and_deploy.md#if-create-fails-with-managedenvironmentcapacityheavyusageerror)).
If you use a different name, use it everywhere, including the variables in 03.

## Cost (eastus retail list prices, 2026-10-07)

| Item | Per month |
|---|---|
| Container app, 0.5 vCPU / 1 GiB, **min 0** (sleeps when unused; warmed to min 1 only for client calls) | ~$0–1 when mostly unused. Always-on min 1 would be ~$10 idle, up to ~$34 busy |
| Container registry, Basic | ~$5 |
| Key Vault, image builds, Log Analytics (first 5 GB/month free) | cents |

**Do not add** a Dedicated workload profile or a private endpoint to the environment: each adds
$0.10/hour (~$73/month).

## Skipping 01 (key rotation)

The deploy does not depend on 01:
- production's storage account never leaked
- production uses OpenAI **key2**, which never leaked

What stays open until someone does 01:
- the test storage key (`paccavisionsa` key1) and the shared OpenAI key1 remain valid for anyone with
  a clone
- the production **pipeline** still runs on OpenAI key1, so abuse of that key (quota, deleted
  analyzers) can reach production documents

While 01 is skipped:
1. Never put key1 anywhere new.
2. Never regenerate key1 without first moving its users to key2 (01).

## Not in this deploy (tracked in [../TRACKER.md](../TRACKER.md))

- **Custom domain:** free in Azure, but it needs emids.com DNS records from IT.
- **CI/CD:** deploys are manual until the test gate exists.
- **Managed identity for Cosmos and Storage:** needs code changes, so the app uses keys.
- **More than one replica:** Solutions V2 writes doc-type files to local disk.
