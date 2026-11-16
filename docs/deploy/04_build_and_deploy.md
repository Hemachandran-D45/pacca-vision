# 04 — Build the image, create the app, apply the settings

You need 02 done (registry with **Admin user** on, identity, Key Vault with both access policies) and
03 done (secrets in Key Vault), in the terminal from 03 §1.

Labels marked † are not on Microsoft Learn and may be worded slightly differently in your portal.

---

## 1. Build the image (command)

Production images come from **`main`** only, after `dev` is merged through a PR. The tag is the
commit hash, so you always know which commit is running.

```bash
git switch main && git pull --ff-only
TAG=$(git rev-parse --short HEAD)
az acr build -r $ACR -t pacca-idp-web:$TAG .     # builds in Azure, as you; no local Docker needed
echo $TAG
```

*The log ends with `Run ID: ... was successful`.*

## 2. Create the app (portal)

1. Top search bar → **Container Apps** → **+ Create** → **Container App**.
2. **Basics**:

   - **Resource group**: `pacca-idp-rg`
   - **Container app name**: `ca-pacca-idp-web`
   - **Deployment source**: *Container image*
   - **Region**: *East US*
   - **Container Apps environment**: **Create new environment**, then in the panel:

   | Tab               | Field                                                                    | Value                                                                                      |
   | ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
   | Basics            | **Environment name**                                               | `cae-pacca-idp`                                                                          |
   | Basics            | **Zone redundancy**                                                | **Disabled**                                                                         |
   | Workload profiles |                                                                          | add nothing (the built-in *Consumption* profile is enough)                                |
   | Monitoring        | **Logs Destination**                                               | **Azure Log Analytics** → **Create new** → `log-pacca-idp` → **OK** |
   | Networking        | **Public Network Access** / **Use your own virtual network** | **Enabled** / **No**                                                           |

   → **Create** (closes the panel).
3. **Container**:

   | Field                                 | Value                                                                                                                                 |
   | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
   | **Use quickstart image**        | unticked                                                                                                                              |
   | **Name**                        | `web`                                                                                                                               |
   | **Image source**                | **Azure Container Registry**                                                                                                    |
   | **Registry**                    | `paccaidpacr`                                                                                                                       |
   | **Authentication type**         | **Secret** (not Managed identity). This is the admin login: *"The ACR username and password will be automatically retrieved"* |
   | **Image** / **Image tag** | `pacca-idp-web` / the `$TAG` from step 1                                                                                          |
   | CPU and memory †                     | **0.5 CPU cores, 1 Gi**                                                                                                         |
   | **Environment variables**       | **leave empty**; step 4 sets them all                                                                                           |
4. **Ingress**:

   - **Ingress**: **Enabled**
   - **Ingress traffic**: **Accepting traffic from anywhere**
   - **Ingress type**: *HTTP*
   - **Insecure connections**: **unticked**
   - **Target port**: **`3000`**
5. **Review + create** → **Create** → *3–6 minutes* → **Go to resource**.

*Overview → **Application Url** + `/healthz` shows `{"ok":true}`. The app runs but cannot sign anyone
in until step 4.*

### If Create fails with `ManagedEnvironmentCapacityHeavyUsageError`

*"Creating a new cluster is unavailable at this time in region eastus."* Azure has no Container Apps
capacity in that region at the moment. Nothing in your setup is wrong. The wizard leaves behind an
environment in state **Failed** and no app.

1. **Delete the failed environment.** `cae-pacca-idp` → **Overview** → **Delete** → confirm. Wait until
   it is gone from the resource group.
2. Then either:
   - **Retry East US later** (capacity usually returns within hours): rerun §2 unchanged.
   - **Or use East US 2.** It is in the same Virginia metro as the data plane, so latency to Cosmos and
     storage stays at a few milliseconds. Only the environment and the app move; the registry, Key
     Vault and log workspace stay in East US and work across regions.
     1. **Identity:** `id-pacca-idp-web` was created with **Isolation scope: Regional** in East US, so it
        cannot attach to an East US 2 app. Delete it, then recreate it with the same name in
        **East US 2** (02 §3).
     2. **Key Vault access policy:** `kv-pacca-idp-web` → **Settings → Access policies**. Delete the old
        entry, which now shows as an unknown principal, and add `id-pacca-idp-web` again with secret
        **Get** and **List** (02 §4).
     3. **Rerun §2** with **Region: East US 2**:

        - **Create new environment** `cae-pacca-idp`
        - **Logs Destination** Azure Log Analytics → **select the existing `log-pacca-idp`** (do not
          create a new one)
        - everything else unchanged

        Steps 3–5 and `prod-config.sh` need no change.

## 3. Attach the identity (portal)

`ca-pacca-idp-web` → **Identity** (under **Security**, or **Settings** in older portals) → **User
assigned** → **+ Add** → `id-pacca-idp-web` → **Add**.

## 4. Apply the settings (command)

```bash
bash scripts/deploy/prod-config.sh apply
```

This adds the 7 Key Vault references (read through `id-pacca-idp-web`) and sets the 15 plain settings
plus the 7 secret references from `.env.prod`. The line *"must be restarted in order for secret
changes to take effect"* is expected and needs no action:
- if a setting changed, Azure creates a new revision, which reads the secrets fresh
- if nothing changed (for example, only a Key Vault value changed), the script restarts the running
  revision itself

The app now works, but on the wizard's defaults: **min 0 / max 10 replicas** and no HTTP probes.
Step 5 fixes that, and it is not optional. Two replicas would disagree about Solutions V2's
local files.

## 5. Health probes and scale (portal)

1. `ca-pacca-idp-web` → **Application → Revisions and replicas** → **Create new revision**.
2. **Container** tab → tick `web` → **Edit** → **Health probes** tab. With ingress on, liveness and
   readiness are already enabled with the portal's defaults. Change only this:

   | Probe | Change | Keep the default |
   |---|---|---|
   | **Liveness** | **Transport** HTTP, **Path** `/healthz`, **Port** `3000` | delay 0, period 10, timeout 5, failure 3 |
   | **Readiness** | **Transport** HTTP, **Path** `/healthz`. **Failure threshold 48 → 3** (otherwise a hung copy keeps traffic for 4 min) | port 3000, period 5, timeout 5 |
   | **Startup** | tick **Enable**, **Transport** HTTP, **Path** `/healthz` | port 3000, delay 1, period 1, timeout 3, failure 240 (up to 4 min to boot) |

   The **Path** field appears once Transport is HTTP. Liveness and readiness only start after the
   startup probe passes, so their initial delay of 0 is fine.

   → **Save**.
3. **Scale** † tab: **Min 0, Max 1**.
   - **Max 1** is required: Solutions V2 writes to local disk, so two copies would disagree.
   - **Min 0** lets the app sleep after ~5 minutes with no requests (~$0 while idle). The first visit
     after that waits ~10–30 s for a cold start. Before a client call, warm it up with min 1
     ([05](05_verify_update_rollback.md#before-and-after-a-client-call)).
4. **Create** → **Refresh** until the new revision is running.

`/healthz` touches no dependency on purpose: a probe on `/api/senderra/health` would query Cosmos
every 10 s and restart the app whenever Cosmos is slow.

Next: [05 — Verify, update, roll back](05_verify_update_rollback.md).
