# Tracker

Open work, decisions and follow-ups for PACCA IDP. **Update this file in the same commit as the
work it describes**: tick the box and add the commit hash.

_Last updated: 2026-10-08_

| Area | State |
|---|---|
| [1. First production deploy](#1-first-production-deploy-aca) | Code ready on `dev` (not pushed); Azure not started |
| [2. Vercel / `main` separation](#2-vercel--main-separation--owner-hemachandran) | Waiting on Hemachandran |
| [3. Tests and the CI gate](#3-tests-and-the-ci-gate) | 323 behavioural tests (server + client flows), offline (no-network guard); route characterization tests in progress; no client, lint or e2e tests, no CI yet |
| [4. CI/CD](#4-cicd-after-section-3) | Test workflow on `main` (check + test); deploy not started |
| [5. Security hardening](#5-security-hardening) | Leaked keys removed from code; **rotation deferred** (not blocking the deploy) |
| [6. Scalability](#6-scalability-and-performance) | Planned for pilot scale, after the refactor; budgets in place |
| [7. Modular-monolith refactor](#7-refactor-to-a-modular-monolith) | Planned and agreed; next. Test safety net in place |
| [8. Product and auth roadmap](#8-product-and-auth-roadmap) | Planned |

---

## 1. First production deploy (ACA)

Goal: `main` running in Azure Container Apps, with every web-app resource in its own resource
group **`pacca-idp-rg`** (registry, identity, Key Vault, environment, app, logs). It uses the
**senderra data plane** in `senderra-idp-rg` (`cosmos-senderra-idp`, `senderraidpsa`,
`func-senderra-idp-001`) with keys only. It is built for **Contributor** rights, with no role
assignments: Key Vault on the access-policy model, secrets read by the managed identity, and the
image pulled with the registry admin user. It is deployed by hand from the
portal ([deploy guide](deploy/README.md)), with no feature change from what Vercel serves. Vercel
stays on `pacca-vision-rg`.

### Done (on `dev`, local)
| Commit | What |
|---|---|
| `71f038f` fix(security) | Removed the hardcoded `paccavisionsa` storage key and `senderra-idp-fr` OpenAI key fallbacks. **Test:** source scan for key-shaped literals, and no-key behaviour |
| `65289ce` fix(build) | `build:server` copies `server/prompts` to `dist/prompts`. Solutions failed on `pnpm start` / in a container without it. **Test:** builds the bundle and compares the prompt files |
| `a201e8d` fix(server) | A throwing Express route no longer kills the Node process. App construction moved to `server/app.ts` (`createApp`) so it can be tested. **Test:** a real app with a throwing route answers 500 and keeps serving |
| `fb02fe4` feat(deploy) | Dockerfile, `.dockerignore`, `/healthz`, graceful SIGTERM shutdown. **Tests:** `/healthz` with no config; the built server exits 0 on SIGTERM |
| `eb22a38` docs | Markdown organized under `docs/`; prototype-era docs moved to `docs/archive/` |
| `705e379` feat(deploy) | `.env.prod` + `scripts/deploy/prod-config.sh` push secrets to Key Vault and settings to the app. **Test:** runs against a fake `az` |
| docs(deploy), with this tracker | Deploy guide: the portal creates resources, commands push the image and config |

Every test above was checked to **fail** without its fix.

### To do, in order
- [ ] **Push `dev`, open PR `dev` → `main`, review, merge.** (Gangadara pushes; agents never push.)
  - While Vercel's production branch is still `main`, this merge **also deploys to Vercel
    production**. The changes are Vercel-safe, with one catch: the hardcoded fallbacks are gone. If
    Vercel lacks `AZURE_STORAGE_KEY` or `OPENAI_API_KEY`, those features now fail loudly instead
    of silently using the leaked key. Confirm with Hemachandran first.
- [ ] **Pre-flight on the production data:** ([deploy README](deploy/README.md#before-you-start-production-data))
  - Confirm `cosmos-senderra-idp` → `users` has sign-in accounts, or seed them.
  - Look at what is already in `documents`. Production users will see it on day one.
- [ ] Create the resources: [deploy/02](deploy/02_azure_resources.md).
- [ ] Create `.env.prod` and push the secrets: [deploy/03](deploy/03_secrets_and_env.md).
- [ ] Build from `main`, create the app, apply the settings: [deploy/04](deploy/04_build_and_deploy.md).
- [ ] Verify: [deploy/05](deploy/05_verify_update_rollback.md).
- [ ] Share the production URL. Add it here.

---

## 2. Vercel / `main` separation — owner: Hemachandran

Vercel is in Hemachandran's account, and its production branch is **`main`** today.

- [ ] **Vercel → Project → Settings → Git → Production Branch: `main` → `dev`.** The testers' link
  then follows `dev`.
- [ ] **Then** add `"git": { "deploymentEnabled": { "main": false } }` to `vercel.json` (commit on
  `dev`; it reaches `main` with the next PR). Pushes to `main` then never create a Vercel
  deployment. **Order matters:** doing this before the branch switch would stop Vercel production
  deploys altogether.
- [ ] Set `AZURE_STORAGE_KEY` and `OPENAI_API_KEY` to the **key2** values in every Vercel
  environment and redeploy. This is step 4 of [deploy/01](deploy/01_rotate_leaked_keys.md) and must
  happen before key1 is regenerated.
- [ ] Decide whether Vercel also gets `IVR_WRITEBACK_API_KEY`. Today its writeback route is open
  to anyone.

**Decision:** the Vercel files (`api/`, `vercel.json`, `.vercelignore`) **stay in `main`**.
Branch-specific files fight git: GitHub PR merges ignore per-file merge rules, so every
`dev` → `main` PR would show or conflict on them. They never reach production, because
`.dockerignore` excludes them from the image. The refactor (section 7) shrinks them to a thin adapter.

---

## 3. Tests and the CI gate

**Rule for CI/CD: nothing deploys unless every check below passes on the PR.** Until these exist,
CI/CD (section 4) waits.

**Today:**
- 323 vitest tests:
  - `tests/server/`: auth, login, route policy, page↔route roles, models, upload model,
    analytics model, the secrets scan, the Express app (`createApp`), the server bundle and
    SIGTERM, the test fakes themselves, and route characterization (`routes-*.test.ts`).
  - `tests/client/`: the whole React app in jsdom, signed in through the real form, talking to
    the real server dispatcher over a fake `fetch` (`harness.tsx`): sign-in and role tabs, the
    upload lifecycle on screen, HIL correct / approve / reject, and a client poll budget.
- **Every test runs offline and costs nothing.** `tests/setup/no-network.ts` refuses any
  non-loopback connection and fails the test that tried. Azure is replaced by fakes in
  `tests/server/fakes/`: an in-memory Cosmos that evaluates the server's SQL, a blob listing,
  a `fetch` router for the IVR backend / Function App / OpenAI, and a configured env.
- `pnpm check` runs the ESM import check and `tsc`.
- **Missing:** client tests, lint, e2e tests, and any CI to run them.

### Regression tests for the deploy fixes
- [x] Express app construction extracted into `createApp()` (`server/app.ts`), tested in-process (`a201e8d`):
  - [x] a throwing async route returns 500 and the next request still succeeds (`a201e8d`)
  - [x] `/healthz` returns 200 with **no** env configured (`fb02fe4`)
  - [ ] the SPA fallback serves `index.html` for `/documents`, and `/api/...` never gets HTML.
    **Known gap (verified):** `GET /api/unknown` gets `index.html` with a 200 from the catch-all.
    Unknown `/api/senderra/*` routes correctly return a JSON 404. Pinned as KNOWN BEHAVIOUR in
    `hosts.test.ts`; the fix flips that test. Same fix: a body over 256 kB or malformed JSON gets
    Express's default HTML error page, not JSON.
- [x] Build test: `build:server` ships every prompt template to `dist/prompts`, without nesting (`65289ce`).
- [x] Source scan for key-shaped literals in `server/`, `api/`, `shared/`, `client/src/` (`71f038f`).
- [ ] gitleaks in CI as well: it scans the whole diff, commit messages and history, not just
  source files.
- [x] Built server: `/healthz` → 200 and exit 0 on SIGTERM (`fb02fe4`).
- [ ] Container smoke test in CI: `docker build`, run with no env, `/healthz` → 200,
  `/api/senderra/health` → `configured:false`. Today this is only verified by hand.

### Coverage to add

Characterization tests come first: they pin today's behaviour, known bugs included, so the
modular-monolith refactor (section 7) can prove it changed nothing. A known bug gets a test
named KNOWN BEHAVIOUR that asserts the current behaviour; its fix commit flips the assertion.

**How these tests are written** (decided 2026-10-08):
- **Behaviour, through the public surface.** Call the route the way the UI does and assert what
  a user, a reviewer or the pipeline would notice: statuses, filters, who may do what, what is
  written to Cosmos, what is sent to IVR. Change the behaviour and a test breaks; rename or
  move code and none does.
- **Name the fields the UI reads** (`toMatchObject`), not whole bodies. No snapshots: they broke
  on harmless changes (a new field, reworded text) and would fight the performance work.
- **No implementation trivia:** header spellings, step-name lists, config file text.
- **BUDGET tests** count Cosmos queries and IVR calls per request using the fakes. They fail when
  a change makes a poll more expensive, which is how performance stays measurable.
- **Prove each test bites:** break the code on purpose, see the test fail, revert. Say so in the
  commit body.

- [x] Offline fakes (Cosmos, Blob, `fetch`) and the no-network guard.
- [ ] Route characterization against the fakes (`tests/server/routes-*.test.ts`, `hosts.test.ts`).
  - [x] Read side: `/documents` (statuses, filters, pending uploads, IVR sync on read),
    `/document`, `/stats`, `/health`, and the upload lifecycle: Queued on the very next poll after
    the PUT, then Processing → Needs Review → In HIL Review → Processed as each write lands.
  - [x] Budgets: one Cosmos query and no IVR call per `/documents` poll; one query per `/stats`.
  - [x] Write side: `/review` (every action, validation, side-writes), `/upload-sas`.
  - [x] IVR: `/ivr-trigger` (every outcome mapping), `/ivr-outreach`, `/ivr-writeback` + `/ivr-webhook`.
  - [x] Analytics, observability (FA proxy + Cosmos fallback), pipeline gaps, KQL, diagnose, the
    copilot (heuristic fallback and the OpenAI tool loop), schema + schema sync. Models /
    llm-settings were already covered by `models.test.ts`.
  - [x] Solutions V2 (GET / PATCH / POST / DELETE) on a temporary copy of `analyzers/`, with
    `python` and Azure Files faked; Solutions V1.
  - [x] The HTTP hosts (`hosts.test.ts`): Express (static files, SPA fallback, `/api/senderra/*`,
    `/api/solutions*`, body limits) and every Vercel `api/` function plus the `vercel.json`
    rewrites. The Vite dev-server plugins (the third host) are dev-only and not covered; the
    refactor replaces them by mounting the Express app.
- [ ] ESLint (typescript-eslint, react-hooks, **jsx-a11y**), run inside `pnpm check`.
- [x] Client flow tests (vitest + Testing Library + jsdom): sign-in, the upload modal and the
  status changing on each poll, HIL correct / approve / reject. Flows only, no component tests.
- [ ] **Bug found by the HIL test:** a blank field's input is pre-filled with the display dash
  `—` (`formatFieldValue(null)`), so a reviewer who clicks and types saves `—1980-01-01`. Pinned as
  KNOWN BEHAVIOUR in `tests/client/hil-review.test.tsx`; fix after the refactor.
- [ ] E2E smoke (Playwright) against a deployed revision: sign in → Documents → open a document.
  The dev box has no headless Chromium (see README); the CI runner does.
- [ ] Accessibility: axe checks inside the Playwright run on the main pages.
- [ ] A coverage report, then a threshold once the baseline is known.

---

## 4. CI/CD (after section 3)

- [x] **Test workflow on `main`** (`.github/workflows/ci.yml`, decided 2026-10-08: `main` only,
  tests only for now). Every PR into `main` and every push to `main` runs
  `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm test`. No secrets, no deploy: the
  suite fakes Azure, OpenAI and IVR and refuses any outbound connection.
- [ ] **Branch protection on `main`** (a repo admin, in GitHub → Settings → Branches):
  - require a PR
  - require the status check **`check + test`**
  - no direct pushes, no force-push
- [ ] Add to the workflow: gitleaks, `docker build` + smoke. Decide whether PRs into `dev` run it
  too.
- [ ] **Deploy workflow** (on push to `main` only):
  1. Log in to Azure with GitHub OIDC (a federated credential, no stored Azure secret).
  2. `az acr build -t pacca-idp-web:<sha>`.
  3. `az containerapp update --image ...:<sha>`.
  4. Poll `/healthz`.
  5. On failure, re-activate the previous revision.

  `senderra-github-deploy` in `senderra-idp-rg` already does OIDC for senderra; reuse the pattern.
  We can create the deploy identity `id-pacca-idp-deploy` and its federated credential ourselves.
  Its roles (**AcrPush** on `paccaidpacr`, **Container Apps Contributor** on `ca-pacca-idp-web`)
  need IT (the deployer has Contributor, which cannot create role assignments).
- [ ] **No app secrets in GitHub.** The pipeline only builds and swaps the image tag. Secrets stay in
  Key Vault and reach the app through its identity, so GitHub holds no app secret and no Azure
  password (OIDC). Settings changes stay `prod-config.sh apply`, or become a separate workflow step
  that reads the same names. (Decided 2026-10-08; see Decisions.)
- [ ] `dev` keeps deploying to Vercel through Vercel's own git integration, not this pipeline.

---

## 5. Security hardening

- [ ] **Rotate the leaked keys:** [deploy/01](deploy/01_rotate_leaked_keys.md). **Deferred on
  2026-10-07; it does not block the deploy** ([why, and the rules meanwhile](deploy/README.md#skipping-01-key-rotation)).
  - Until it is done, key1 of `paccavisionsa` (test storage) and `senderra-idp-fr` (shared
    OpenAI/CU) stays valid for anyone with a clone.
  - The production *pipeline* uses `senderra-idp-fr` key1, so abuse of that key can reach
    production documents, even though the web app runs on key2.
  - When it is done: Hemachandran updates Vercel first (section 2), then key1 is regenerated.
- [x] **Separate dev data** (decided 2026-10-07): production uses `senderra-idp-rg`, Vercel uses
  `pacca-vision-rg`, so testing never touches production documents.
- [ ] **Still shared between test and production:** the IVR backend and Azure OpenAI
  (`senderra-idp-fr`). A Trigger outreach from the Vercel link places a **real** call. Ask the IVR
  team for a test endpoint, or keep `PACCA_IVR_TRIGGER_ENABLED=false` on Vercel.
- [ ] **Two role assignments for `id-pacca-idp-web`, then turn off the ACR admin user.** The
  deployer has Contributor, which cannot create role assignments (`Microsoft.Authorization/*/Write`
  is excluded). Not needed to go live. Ask an Owner (AzureAdmin@emids.com) or User Access
  Administrator (Admin_Mowleesh@emids.com) once:
  - **AcrPull** on `paccaidpacr`. Then switch the app's registry auth to the identity and untick
    **Admin user**.
  - **Log Analytics Reader** on `senderra-idp-log`. Then set `LOG_ANALYTICS_WORKSPACE_ID` +
    `AZURE_CLIENT_ID`, so the Observability copilot's *Azure Monitor* tool works.
  - Optional, same visit: switch `kv-pacca-idp-web` from access policies to RBAC (*Key Vault
    Secrets User* for the identity, *Secrets Officer* for the deployer). Access policies work; RBAC
    is just the newer model.
- [ ] Managed identity for Cosmos (data-plane RBAC) and Storage (user-delegation SAS), then drop
  `COSMOS_KEY` / `AZURE_STORAGE_KEY`. Code changes plus role assignments.
- [ ] Restrict blob CORS from `*`: `paccavisionsa` to the Vercel origin, `senderraidpsa` to the ACA origin.
- [ ] IVR:
  - Give the IVR team `ivr-writeback-key` and the production callback URL.
  - Ask them for a stable hostname instead of the raw-IP `32-198-146-206.sslip.io`.
- [ ] **Observability copilot and PHI.** With `OPENAI_API_KEY` set and `OPENAI_BASE_URL` unset,
  `server/chatCompletions.ts` defaults to `https://api.openai.com/v1`, and the copilot sends tool
  output (document ids, file names, error text) to it. A file name can carry a patient name. Make
  the base URL required (Azure OpenAI under the BAA), like the other "no fallback" fixes. Pinned by
  a KNOWN BEHAVIOUR test in `routes-observability.test.ts`.
- [ ] `/observability-diagnose` and the copilot paste `docId` / `runId` into KQL text unescaped.
  Harmless today (the engine filters Cosmos rows in memory), but it becomes an injection the day
  these strings reach Log Analytics.
- [ ] Per-IP rate limit on `POST /api/senderra/login`. A per-account lockout exists; a per-IP
  limit does not.
- [ ] Security headers on Express: CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors`.
- [ ] Error responses: the Vite dev plugins and some handlers return `String(error)` to the
  browser. Audit them for stack traces and PHI.
- [ ] Solutions V1 commits through a personal PAT to `Chegu-Pavanaditya-Sairam/senderra-idp-sol`.
  No screen uses V1, so remove it (or move to a GitHub App if it comes back).
- [ ] PHI review of what reaches `ContainerAppConsoleLogs_CL`.

---

## 6. Scalability and performance

**Target: pilot scale** (hundreds of documents a day, fewer than 10 concurrent users), decided
2026-10-08. **After the refactor**, one budget-tested commit per change.

Rules:
- **Keep the instant status updates.** An upload shows as Queued on the very next poll, then
  Processing → Needs Review → In HIL Review → Processed as each write lands, with no click or
  reload. Guarded by the lifecycle tests in `routes-documents.test.ts` and
  `tests/client/upload.test.tsx`. No cache or batching may delay a status by more than one poll.
- **Every change moves a BUDGET test on purpose.** Today: one `/documents` poll = 1 Cosmos query
  and 0 IVR calls; one `/stats` = 1 query; an idle Documents page = 2 `/documents` calls per 6 s.

Today one open tab costs about three full cross-partition scans every 5–6 s. Planned, in order:
- [ ] **Client:** one shared fetch per endpoint (TanStack Query), so the HIL badge
  (`QueueCountContext`) and the page share one `/documents` call; pause polling in hidden tabs;
  stop polling before sign-in (the badge polls `/documents` while signed out today).
- [ ] **Server:** coalesce concurrent identical scans into one in-flight request (N tabs = 1 scan),
  with no cache older than one poll.
- [ ] Take the IVR sync off the `/documents` read path (it calls IVR per routed document on every
  poll).
- [ ] Bound the pending-upload check: `listRecentUploads` lists every blob under `ui/` on every
  poll, and that grows forever.
- [ ] `/stats`, `/analytics` and the observability views each re-scan the same items; reuse one
  scan. Opening a document runs a cross-partition duplicate query; make it cheap or lazy.
- [ ] Image is ~800 MB because the runtime stage copies the build stage's whole `node_modules`
  (frontend and test libraries included). Bundle the server dependencies, prune the rest; target
  < 250 MB.
- [ ] Raise ACA max replicas and add an HTTP scale rule. Solutions V2 no longer writes to local
  disk (Cosmos `solutions` container + Function App since `ca64f9f`; the last local write, the
  `pacca_guidance.json` sync, was removed on `fix/solutions-v2-bugs`), so the max-1 rule in
  docs/deploy no longer has a reason. Decide before changing it.
- [ ] Review writes are last-writer-wins. Add an ETag precondition before two reviewers can share
  a document.
- Not at pilot scale: server-side paging in Cosmos, a summary/read-model item or change feed.
  Revisit if volume grows past a few thousand documents a day.

---

## 7. Refactor to a modular monolith

**Next.** Agreed 2026-10-08. **Pure moves, no behaviour change:** bug fixes and performance come
after, each in its own commit. The safety net is section 3: every route, both hosts and the three
client flows are covered, and `pnpm check && pnpm test` must pass on every commit. A move that
needs a test changed is a behaviour change, so it does not belong here.

**Target layout:** one package, domain modules.

```
server/
  app.ts, index.ts
  http/        the route table (ROUTE_POLICY), safe(), the Express and Vercel adapters
  platform/    config and the clients: Cosmos, Blob, Azure Files, OpenAI, Log Analytics
  modules/     auth · documents · review · ivr · analytics · observability · solutions · models · schemas
client/src/
  app/         shell, layout, routes
  features/    documents · hil-review · dashboard · analytics · observability · solutions · settings
  components/ui/   unchanged
```

- **URLs stay as they are** (`/api/senderra/*`, `/api/solutions-v2`, `/api/solutions`). The IVR
  callback and Vercel depend on them; renaming them is a behaviour change.
- No pnpm workspace (`apps/*`, `packages/*`) and no router swap in this pass: more churn for the
  Dockerfile and Vercel than they are worth now.

Steps, one commit (or small PR) each:
- [ ] Collapse the hosts into one Express app: Vite dev mounts it as middleware, and Vercel reaches
  it through one thin adapter. `hosts.test.ts` proves nothing a client can see changed.
- [ ] Server: move `server/senderra/*` into `platform/` and `modules/<domain>/`; split
  `server/senderra/api.ts` (1,050 lines) into the route table plus one handler file per module.
- [ ] Client: move pages and `client/src/senderra/*` into `features/<domain>/`; split the 1,000+
  line pages (`ObservabilityPage`, `AnalyticsPage`, `HilReviewPage`, `SolutionsV2`) into
  components inside their feature.
- [ ] **Delete unreachable code only** (decided 2026-10-08): what nothing imports or renders.
  - the unrendered components `UploadPanel`, `DocumentsLive`, `HilLive`, `CommandCenterLive`
    (the live screens are `DocumentsPage`, `UploadDocumentModal`, `DashboardPage`, `HilReviewPage`)
  - the Manus leftovers (`ManusDialog`, `Map`, debug collector, storage proxy, `.manus-logs/`,
    `template.json`)
  - the unused dependencies (`axios`, `framer-motion`, `streamdown`, `add`, `pnpm`)
  - `package-lock.json`
- **Kept** (reachable, so removing them is a product decision, not a refactor): the hidden fixture
  screens and `mockData`, the Invoice Processing demo solution, and Solutions V1 (`/api/solutions`;
  its removal stays a security item in section 5).
- [ ] README and `docs/architecture.md`: fix the stale "Layout" and "Known dead code" sections, and
  the architecture doc's list of live components, to match the new layout.

---

## 8. Product and auth roadmap

- [ ] **Client role.** Email + password, with emails **whitelisted by hand** in the Cosmos `users`
  container (like pacca-value-portal).
  - `isAllowedEmail` in `server/auth.ts` must accept whitelisted non-@emids addresses. It is an
    @emids regex today and is also checked inside `verifySession`.
  - Add the role in `server/auth.ts`, `shared/roles.ts` and the seed script, with policy and
    page-route tests.
- [x] **Solutions V2 create/delete** no longer runs `build_prompts.py`: compilation lives in the
  Function App (`senderra-idp-sol`, `solutions/provision` and `solutions/delete`).
- [ ] **Solutions V2 before ACA:** create the `solutions` container (pk `/typeKey`) in the
  production Cosmos account and run `pnpm seed:solutions` against it. Saved types reach the
  pipeline only after a Function App restart (`restartRequired`); the UI now says so.
- [ ] **Solutions V2 edits are drafts until Save.** PATCH writes `fields` in Cosmos; only
  provisioning compiles them. The Function App compiles other types from `provisionedFields`
  (senderra-idp-sol `fix/solutions-skip-unprovisioned`); rows provisioned before that compile
  from `fields` until saved once more.
- [x] **Solutions V2 concurrent Save.** Two provisions at the same moment could each read Cosmos
  before the other wrote, leaving one type out of the rebuilt `type_catalog.txt` /
  `_classification.json`. The Function App now rebuilds under a blob lease (senderra-idp-sol
  `shared/catalog_lock.py`, blob `locks/solutions-catalog` in its `STORAGE_CONNECTION_STRING` account).
- [x] **Solutions V2 Cosmos read errors.** The Function App swallowed failed reads: a failed
  rebuild read published a catalog with only the saved type (or "No document types configured" on
  delete), and a throttled read of the existing row made a save overwrite its curated text. They now
  fail the request (500) and leave the files as they were (senderra-idp-sol `59f79a8`).
- [x] **Solutions V2 time budget.** pacca-vision waits 110 s (`FA_TIMEOUT_MS`, under Vercel's
  120 s); the Function App bounds provisioning to fit (LLM call 40 s / 1 attempt, lock wait 30 s;
  senderra-idp-sol `230e8e9`). A timeout is a 504 that says the save may still complete.
- [x] **Solutions V2 delete error text.** No longer claims "nothing was deleted": the Function App
  may have removed the row before failing, so the message says retrying is safe.
- [x] **Solutions V2 asset writes.** Temp file + rename, and failed share uploads/deletes fail the
  request (senderra-idp-sol `db20cf3`).
- [ ] **Custom domain.** Free in Azure (managed certificate), but it needs CNAME and `asuid` TXT
  records in the emids.com DNS, which means a request to IT. **Parked:** no new permissions for
  now.

---

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-07 | `dev` → Vercel (test link); `main` → ACA (production); changes reach `main` only by PR | Testers keep their link; production only gets reviewed code |
| 2026-10-07 | One container for UI + API on ACA, image in ACR, secrets in Key Vault | `server/index.ts` already serves both; PHI stays in the Azure tenant |
| 2026-10-07 | Production data plane = `senderra-idp-rg`; test (Vercel) = `pacca-vision-rg` | Testing never touches production documents; same pipeline code and doc types in both |
| 2026-10-07 | Email + password sign-in stays (no Entra) | Matches pacca-value-portal; clients will be whitelisted by hand |
| 2026-10-07 | Vercel files stay in `main` | See section 2 |
| 2026-10-07 | Fix bugs and deploy first, refactor after | A working deploy is the baseline each refactor step is checked against |
| 2026-10-07 | No custom domain yet | Needs DNS permission from IT |
| 2026-10-08 | Web-app resources in a new resource group `pacca-idp-rg` | Isolated from both data planes (`pacca-vision-rg` test, `senderra-idp-rg` prod): separate lifecycle, cost and blast radius |
| 2026-10-08 | First deploy needs only Contributor: managed identity + Key Vault on **access policies**, ACR admin-user pull, no Log Analytics identity | The deployer has Contributor (verified with the permissions API), which can create the identity and vault and write access policies but not role assignments. AcrPull and Log Analytics Reader wait for an Owner (section 5) |
| 2026-10-08 | Keep Key Vault when CI/CD arrives; GitHub holds no app secrets | Secrets in Azure with audit and rotation without redeploy; the pipeline only needs AcrPush + Container Apps Contributor via OIDC |
| 2026-10-08 | Deploy guide has one path per task: the portal creates and configures resources; commands push the image, secrets and settings | One way to do each thing; no parallel portal/CLI instructions to keep in sync |
| 2026-10-08 | Production settings in a gitignored `.env.prod`, pushed by `scripts/deploy/prod-config.sh` | One reviewed file instead of 24 portal fields; keys read from Azure go straight to Key Vault |
| 2026-10-08 | Production scales to zero (min 0, max 1); warm it to min 1 only before client calls | Saves ~$10/month while unused. The cost is a ~10–30 s first load after 5 idle minutes. Max stays 1 because Solutions V2 writes to local disk |
| 2026-10-08 | Tests assert behaviour through the public surface: the fields the UI reads, no snapshots, no implementation trivia; BUDGET tests count Cosmos/IVR calls; tests never touch the network | Tests should break when behaviour changes and only then. Snapshots broke on harmless changes and would fight the performance work |
| 2026-10-08 | CI: GitHub Actions on `main` only (PRs into `main` and pushes), check + tests only, no deploy, no secrets | Gate production first; deploy automation comes later (section 4) |
| 2026-10-08 | Refactor first (pure moves), then bug fixes and performance, each in its own commit | A refactor checked against unchanged tests is provably behaviour-preserving; mixing in fixes would hide what changed |
| 2026-10-08 | Refactor layout: one package; `server/{http,platform,modules/<domain>}`, `client/src/{app,features/<domain>}`; URLs unchanged | Domain-first code without the churn of a workspace split or a router swap |
| 2026-10-08 | The refactor deletes unreachable code only; hidden fixture screens, the Invoice demo and Solutions V1 stay | Removing anything a user can reach is a product decision, not a refactor |
| 2026-10-08 | Performance targets pilot scale (hundreds of docs/day, <10 users) and keeps status updates instant | Coalescing, shared client fetches and taking IVR off the read path are enough at this scale; paging or a read model waits for real volume |
| 2026-10-08 | Solutions V2 compilation (`build_prompts.py`): not touched for now | Owner's call; its current behaviour, including how it fails in production, is pinned by `routes-solutions.test.ts` |
| 2026-10-07 | Key rotation (deploy/01) deferred; production uses OpenAI key2 | The deploy does not depend on it; the leak stays open until it is done (section 5) |
| 2026-10-07 | Agents commit locally; only humans push | Keeps a human review on everything that leaves the machine |
