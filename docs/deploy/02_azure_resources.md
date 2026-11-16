# 02 — Create the resource group, registry, identity and Key Vault (portal)

Four resources, all in **East US**. The Container Apps environment and its log workspace are
created inside the app wizard in 04.

**Bold** is what you click or fill in; *italics* is what you should see. Labels were checked against
Microsoft Learn in October 2026.

---

## 1. Resource group `pacca-idp-rg`

1. Top search bar → **Resource groups** → **+ Create**.
2. **Subscription** *Senderra IDP*, **Resource group** `pacca-idp-rg`, **Region** *East US*.
3. **Tags** (optional): `app` = `pacca-idp`, `env` = `prod`.
4. **Review + create** → **Create**.

## 2. Container registry `paccaidpacr`

1. Top search bar → **Container registries** → **+ Create**.
2. **Basics**:

   | Field | Value |
   |---|---|
   | **Resource group** | `pacca-idp-rg` |
   | **Registry name** | `paccaidpacr` |
   | **Location** | East US |
   | **Pricing plan** | **Basic** |
   | **Domain name label scope** (if shown) | **Tenant Reuse** |
   | **Role assignment permissions mode** (if shown) | **RBAC Registry Permissions** (needed for the later AcrPull upgrade) |

3. **Review + create** → **Create** → **Go to resource**.
4. **Settings → Access keys** → tick **Admin user**. The app uses this login to pull its image. Your
   own pushes use your Azure login, not this one.

## 3. Managed identity `id-pacca-idp-web`

1. Top search bar → **Managed Identities** → **+ Create**.
2. **Resource group** `pacca-idp-rg`, **Region** *East US*, **Name** `id-pacca-idp-web`,
   **Isolation scope** (if shown) **Regional**.
3. **Review + create** → **Create**.

## 4. Key Vault `kv-pacca-idp-web` (access policies)

The vault uses **Vault access policy**, not RBAC. Under RBAC, both you (to add secrets) and the
identity (to read them) would need role assignments, which Contributor cannot create.

1. Top search bar → **Key vaults** → **+ Create**.
2. **Basics**: **Resource group** `pacca-idp-rg`, **Key vault name** `kv-pacca-idp-web`, **Region**
   *East US*, **Pricing tier** *Standard*. Leave soft delete (90 days) and purge protection
   (*Disable*) at their defaults.
3. **Access configuration** tab:
   - **Permission model**: **Vault access policy** (not the default; change it).
   - *You are already listed under Access policies.* Keep it; that is what lets 03 add secrets.
   - **+ Create** → **Secret permissions**: tick **Get** and **List** only → **Next** → search
     `id-pacca-idp-web` → select → **Next** → **Next** → **Create**.
     *Access policies now lists you and `id-pacca-idp-web`.*
4. **Networking**: leave public access on (*All networks*).
5. **Review + create** → **Create**.

If you already created the vault on RBAC: vault → **Settings → Access configuration** → **Vault access
policy** → **Apply**. Then **Settings → Access policies** → add the two policies above.

Next: [03 — Production settings and secrets](03_secrets_and_env.md).
