# 05 — Verify, deploy new versions, roll back

Run the commands in the terminal from [03 §1](03_secrets_and_env.md#1-terminal-setup-once-per-terminal-04-and-05-use-these-too).

## Verify

```bash
URL=https://$(az containerapp show -g $RG -n $APP --query properties.configuration.ingress.fqdn -o tsv)
curl -s $URL/healthz                  # {"ok":true}
curl -s $URL/api/senderra/health      # "configured":true, "cosmos":"senderra-idp/documents", "storage":"senderraidpsa/docs-in"
```

A `"missing":[...]` list in the second response names the setting that did not arrive. Fix it in
`.env.prod`, then run `prod-config.sh apply` again.

👀 Then open `$URL` in the browser, sign in as `pacca.admin@emids.com`, and check:

| # | In the app                                                       | Expect                                                                                                                                                          |
| - | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Sign in                                                          | **Dashboard** loads. *"Invalid email or password"* → the account is not in the **production** `users` container (README, *Before you start*) |
| 2 | **Documents**                                              | The production list, not Vercel's                                                                                                                               |
| 3 | **Documents → Upload document** → one synthetic test PDF | *Queued → Processing → Processed / Needs Review* in ~20–40 s                                                                                               |
| 4 | Click that document                                              | The PDF preview renders next to the fields                                                                                                                      |
| 5 | **HIL Review** → pick a document                          | PDF and fields load with **Approve & deliver** / **Reject document**. Only click them on your test document                                          |
| 6 | **Settings** → AI model                                   | The model list loads                                                                                                                                            |
| 7 | **Observability** → **Run KQL Query**               | Rows come back. The copilot's *Azure Monitor* tool saying "not configured" is expected                                                                         |
| 8 | **Solutions**                                              | The 9 doc types load                                                                                                                                            |

**Logs:** 👀 `ca-pacca-idp-web` → **Monitoring → Log stream** (live), or:

```bash
az containerapp logs show -g $RG -n $APP --tail 100
az containerapp revision list -g $RG -n $APP -o table
```

## Before and after a client call

The app runs with **min 0**: it sleeps after ~5 minutes with no requests, and the first visit after
that waits ~10–30 s. An open browser tab keeps it awake through its polling. For a client call, keep
one copy warm:

```bash
# before the call (takes ~1 minute: a new revision with min 1)
az containerapp update -g $RG -n $APP --min-replicas 1 -o none
curl -s https://$(az containerapp show -g $RG -n $APP --query properties.configuration.ingress.fqdn -o tsv)/healthz

# after the call
az containerapp update -g $RG -n $APP --min-replicas 0 -o none

# check the current setting
az containerapp show -g $RG -n $APP --query properties.template.scale -o json
```

Never raise **max** above 1: Solutions V2 writes to local disk, so two copies would disagree. If the
app feels slow during a call, a bigger single copy is fine:
`--cpu 1 --memory 2Gi`, and back to `--cpu 0.5 --memory 1Gi` afterwards.

## Deploy a new version

A push to the registry does **not** update the app by itself. Container Apps pulls an image only
when a new revision is created, so every deploy is these two steps:

```bash
git switch main && git pull --ff-only && TAG=$(git rev-parse --short HEAD)
az acr build -r $ACR -t pacca-idp-web:$TAG .
az containerapp update -g $RG -n $APP --image $(az acr show -n $ACR --query loginServer -o tsv)/pacca-idp-web:$TAG
```

The new revision takes traffic only after its probes pass. If it never becomes healthy, the old one
keeps serving.

## Roll back

Deploy the previous tag; the tag is the commit hash (`git log --oneline main`):

```bash
az acr repository show-tags -n $ACR --repository pacca-idp-web --orderby time_desc -o table
az containerapp update -g $RG -n $APP --image $(az acr show -n $ACR --query loginServer -o tsv)/pacca-idp-web:<previous-tag>
```

## Change a setting or a secret

1. Edit `.env.prod`. For a secret, put the new value on its line.
2. Push it:

   ```bash
   bash scripts/deploy/prod-config.sh secrets   # only if a secret changed
   bash scripts/deploy/prod-config.sh apply     # new revision, or a restart if only a secret changed
   ```

`apply` always makes the running app pick up the change. A secret-only change (such as a new IVR key)
creates no new revision, so `apply` restarts the current one, which takes about a minute. Without
that restart the app keeps the old value for up to 30 minutes.

Changing `PACCA_JWT_SECRET` signs everyone out. Afterwards, empty the secret lines in `.env.prod`
again, so the file does not keep production secrets.

## Rotate the registry admin password

The app pulls with **password**, so regenerate password2 first, switch the app to it, then
regenerate password:

```bash
SERVER=$(az acr show -n $ACR --query loginServer -o tsv)
az acr credential renew -n $ACR --password-name password2 -o none
az containerapp registry set -g $RG -n $APP --server $SERVER \
  --username "$(az acr credential show -n $ACR --query username -o tsv)" \
  --password "$(az acr credential show -n $ACR --query 'passwords[1].value' -o tsv)"
az acr credential renew -n $ACR --password-name password -o none
```

## Common failures

| Symptom                                                                | Cause                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Revision never runs; system log says the image pull is *unauthorized* | Admin user is off, or the app holds an old registry password (see *Rotate*)                                |
| Image pull says *manifest unknown*                                    | The tag does not exist:`az acr repository show-tags …`                                                   |
| `prod-config.sh apply` or the revision fails with a Key Vault error  | Identity not attached (04 §3), its access policy lacks **Get/List** (02 §4), or the vault is on RBAC |
| Revision restarts in a loop                                            | Probe on the wrong path or port (`/healthz`, `3000`), or a crash shown in **Log stream**          |
| Every API call returns 503                                             | `PACCA_JWT_SECRET` did not arrive. Rerun `prod-config.sh apply`                                         |
| Signed in but bounced back to the sign-in page                         | You opened `http://`. Use the `https://` URL; the cookie is `Secure`                                   |
