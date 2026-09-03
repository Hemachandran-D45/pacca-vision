# PACCA Vision

Operations UI for a reusable intelligent document-processing platform.
See `PRD_CONTEXT.md` for product intent and `PACCA_VISION_DEMO_PREPARATION.md` for the demo script.

## What this is

The Client 1 workspace runs **two solutions**, switched from the control in the top bar:

| Solution | Backing | Screens |
| --- | --- | --- |
| **Prior Auth Processing** | **Live** — the Senderra IDP pipeline on Azure | Command Center, Documents, Document detail, HIL Review, Analytics & Cost |
| **Invoice Processing** | Demo fixtures, unchanged | the original fixture screens |

Every other screen (Pipeline Monitor, Audit, Solutions, Pipeline Studio, Metadata Studio, Rules,
Integrations, Deploy, Admin) is still fixture-driven in both solutions.

### The live path

```
browser ──1── POST /api/senderra/upload-sas        mint a 15-min, write-only, single-blob SAS
        ──2── PUT  https://<account>.blob…/docs-in/ui/<file>.pdf     direct, bytes skip our API
                     │
                     └─ Event Grid → Service Bus → fn_ocr → work/…/markdown.md
                                                 → fn_extract → results/ + metrics/ + Cosmos
        ──3── GET  /api/senderra/documents        poll every 5s; the doc appears as
                                                 Queued → Processing → Needs Review
        ──4── POST /api/senderra/review           claim / correct / approve, written back to Cosmos
```

**The blob write is the trigger.** Nothing calls the Function App — `parse_ocr_message`
reconstructs a document's identity from its path, so a PUT to `docs-in/<run>/<name>.pdf` starts
the production pipeline with zero changes to `senderra-idp-sol`. Measured end-to-end: **~20–40s**
from upload to extracted fields.

Uploads go **direct to blob** rather than through the API because Vercel caps a serverless request
body at 4.5 MB and a multi-page scan is routinely larger. The account key stays server-side; the
browser only ever receives a scoped, short-lived token for one blob.

### What Cosmos holds

One container, partition key `/documentId` = `<runId>/<docId>`, four items per document:

| item | read by |
| --- | --- |
| `ocr` | page count, `mean`/`min_page_confidence`, CU latency and cost |
| `extract` | the Documents table and every dashboard aggregate — status, doc type, `needs_review`, `review_reasons[]`, `field_score_mean`, tokens, `cache_hit_frac`, cost, latency |
| `fields` | the HIL workbench — per-field value, quote, class, grounding (page, polygon, OCR confidence, `quote_in_document`), per-signal scores, `needs_review` |
| `review` | HIL state — status, `corrections{}`, append-only `audit[]`, `claimed_by`, `reviewed_by` |

`ocr`, `extract` and `fields` are written by the pipeline. **`review` is written by this app**, using
the shape already present in the container.

## Requirements

- **Node 22+** — `@azure/cosmos` and `@azure/storage-blob` both declare `engines: node >= 22`, and
  `package.json` declares the same so Vercel picks the right function runtime. `.nvmrc` pins it:
  `nvm use`
- pnpm 10.4.1 (`corepack enable && corepack prepare pnpm@10.4.1 --activate`)
- Azure: a Cosmos DB account with the pipeline's `documents` container, and the storage account
  holding `docs-in`

## Setup

```bash
pnpm install
cp env.example .env.local      # fill in the Senderra block (see below)
pnpm dev                       # http://localhost:3000
```

`pnpm dev` mounts the whole `/api/senderra` surface as Vite middleware, so dev behaves exactly like
the Vercel deployment — the routing lives in `server/senderra/api.ts` and neither host owns it.

Confirm the wiring: `curl localhost:3000/api/senderra/health` → `{"ok":true,"configured":true,…}`.
Without the variables the app still runs; every live screen shows the server's own
"not configured" message rather than failing silently.

```bash
pnpm check     # tsc --noEmit
pnpm build     # vite build → dist/public, esbuild server → dist/index.js
pnpm start     # Express, serves dist/public  (see Known issues)
pnpm format    # prettier
```

## Environment

All server-only. **Never prefix any of these `VITE_`** — Vite inlines `VITE_*` into the browser
bundle and these are account keys.

| Variable | Where it comes from |
| --- | --- |
| `COSMOS_ENDPOINT`, `COSMOS_KEY` | Cosmos account → Keys → **URI** and **PRIMARY KEY** (not the connection string) |
| `COSMOS_DATABASE`, `COSMOS_CONTAINER` | `senderra-idp` / `documents` |
| `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY` | Storage account → Access keys → key1. Needed to mint SAS tokens |
| `SENDERRA_DOCS_CONTAINER` | `docs-in` — the pipeline's intake container |
| `SENDERRA_UPLOAD_RUN_ID` | `ui` — first path segment, becomes the run id and partition-key prefix |

### Deploying to Vercel

```bash
npx vercel link
bash scripts/vercel-env.sh production    # pushes the block above from .env.local
npx vercel --prod
```

`vercel.json` rewrites everything except `/api/` to `index.html`, so the SPA and the serverless
functions coexist. `api/senderra/[...route].ts` is one catch-all rather than six functions, to stay
well inside the Hobby-plan function cap.

### Node version — this is a hard requirement

`@azure/cosmos` and `@azure/storage-blob` both declare **`engines: node >= 22`**. `package.json` now
declares the same, which is what Vercel reads to pick the function runtime.

If the Vercel project is pinned to Node 18.x or 20.x, the Azure SDKs can fail on import and the
function returns a platform **500** (`FUNCTION_INVOCATION_FAILED`) — it builds and deploys fine, then
crashes on the first request. Check **Project → Settings → General → Node.js Version** is **22.x**.

Note that local dev on Node 20 is *below* that floor. It currently works, but it is unsupported by
the SDKs and is not a safe assumption to build on.

### One Azure prerequisite

Browser-direct upload needs a **CORS rule on the storage account**. Already applied:

```bash
az storage cors add --services b --methods GET PUT OPTIONS HEAD \
  --origins '*' --allowed-headers '*' --exposed-headers '*' --max-age 3600 \
  --connection-string "$STORAGE_CONNECTION_STRING"
```

`*` is safe here in that CORS governs which browser origins may *make* a request, not who is
authorised — the SAS is the authorisation. Tighten `--origins` to the final Vercel domain when
there is one.

## Layout

```
server/senderra/          config, Cosmos queries, SAS minting, the API dispatcher
api/senderra/[...route]   Vercel wrapper around that dispatcher
client/src/senderra/      the live surfaces + the solution switch
client/src/pages/Home.tsx the whole fixture app in one file (~130KB); dispatches to live
                          components when the Prior Auth solution is active
```

## Build hygiene

`pnpm install`, `pnpm dev` and `pnpm build` all run warning-free. Four things were cleaned up to get
there, each worth knowing about:

- **`engines: node >= 22`** in `package.json`, plus `.nvmrc`. This is what tells Vercel which runtime
  to use; without it the project default applies and the Azure SDKs can fail on import.
- **`pnpm.onlyBuiltDependencies`** lists `@tailwindcss/oxide` and `esbuild`. pnpm 10 blocks
  dependency lifecycle scripts unless they are named here. Keeping it in `package.json` rather than
  a machine-local `pnpm config` means CI, Vercel and every teammate behave identically.
- **The Manus runtime plugin is now dev-only** (`apply: "serve"`). It inlined **366 KB** into
  `index.html` — its own bundled React runtime plus the Manus preview harness. Inline HTML cannot be
  cached separately from the document, so that was a third of a megabyte re-downloaded on every page
  load to support an integration that only exists inside Manus. `index.html` went from
  **367.7 KB to 1.2 KB**.
- **The Umami analytics tag is injected conditionally** rather than sitting in `index.html` as a
  `%VITE_ANALYTICS_ENDPOINT%` placeholder. Nothing ever set those vars, so every build warned twice
  and shipped a dead `<script src="/umami">`. It now appears only when both vars are set.

**Do not add `manualChunks`.** Splitting `node_modules` by path was tried and reverted: Vite's
CommonJS interop helpers are *virtual* modules whose id contains no `node_modules`, so a
path-matching splitter leaves them in the entry chunk while the vendor chunk that needs them
executes first. React ends up `undefined` and the app renders a **blank white screen** with
`Cannot read properties of undefined (reading 'createContext')`. `chunkSizeWarningLimit` is raised
instead — the single ~1 MB bundle is an accepted trade-off, not a defect.

## Why `.npmrc` sets `node-linker=hoisted`

**Do not remove this.** Vercel's serverless builder *traces* imports and copies the files it finds —
it does not bundle. pnpm's default symlinked `node_modules` (a tree of links into `.pnpm/`) makes
that trace unreliable for packages with deep transitive graphs like `@azure/cosmos`, whose
dependencies are themselves nested inside `.pnpm/`. The function then dies at **module load**, which
presents as:

```
Error Code: FUNCTION_INVOCATION_FAILED
Execution Duration: 149ms        <- far too fast to be a timeout or a network call
(no response body)               <- the crash is before any of our try/catch
```

A hoisted linker produces the flat, npm-shaped `node_modules` the tracer expects. It costs some disk
and install time and buys a deployment that can resolve its own imports.

For the same reason **`@vercel/node` is deliberately not a dependency.** A project-level
`@vercel/node` pins the platform's builder to that version, and a disagreement between the pinned
version and the platform is one of the few other things that can stop a function booting. The two
types we needed are declared by hand in `server/vercel-types.ts`.

## Debugging a deployed 500

`/api/ping` is a deliberately dependency-free probe — it imports nothing but a type, so it cannot
fail for any reason the Senderra routes can. Comparing the two answers localises the fault:

| `/api/ping` | `/api/senderra/health` | Meaning |
|---|---|---|
| 200 | 200 | working |
| 200 | 500 | the function boots; the fault is the Azure SDK, the config, or Cosmos |
| 500 | 500 | the runtime cannot start — wrong Node version, bad build output, or routing |

`/api/ping` also reports `process.version`, the Vercel region, and which env vars are **present**
(never their values), which is the fastest way to confirm the Node 22 requirement took effect.

The Azure SDKs are imported **lazily**, inside the functions that use them, rather than at module
scope. On a serverless host a module-scope import runs before any handler and therefore before any
`try/catch`, so an import failure kills the function and the platform returns an opaque 500 with no
body. Loading inside the function puts the failure inside our own error handling, so it comes back
as readable JSON naming the cause.

Note that **Vercel Deployment Protection** returns `302 -> vercel.com/sso-api` to anything
unauthenticated, so `curl` against a protected deployment never reaches the function. Read the error
from an authenticated browser's Network tab, or `npx vercel logs <url>`.

## Known dead / stale code

Unused today, listed so nobody assumes it works.

- `patch-*.mjs`, `patch-*.py`, `update-*.py`, `insert-guidance.py`, `repair-*.mjs` (~35 files in the
  repo root) — one-shot codemods already applied to `Home.tsx`. Not safe to re-run.
- `client/src/components/CreateSolutionDialog.tsx` — the only UI for the `/api/solutions` GitHub
  endpoint, imported by nothing.
- `client/src/components/Map.tsx`, `ManusDialog.tsx` — not imported.
- `client/public/images/doc-00{1,2,3}.svg` — superseded by the invoice-demo PDFs.
- `api/index.ts` — a Vercel handler checking `pathname === "/api/solutions"`, which its own file
  path can never produce. Rename it to `api/solutions.ts` if that feature is ever wanted.
- `axios`, `framer-motion`, `streamdown` — dependencies imported by nothing.
- `template.json` — the original scaffold snapshot.

## Known issues

- **`pnpm start` breaks `/api/solutions`** with *"Solution prompt template file was not found."* —
  `server/prompts/create-solution.txt` is not copied into `dist/`. `pnpm dev` and Vercel are
  unaffected; the Senderra routes do not use it.
- **The live UI has not been rendered in a browser here** — no headless Chromium was available
  (missing system libs, no sudo). Typecheck, production build, and every API route including a real
  end-to-end upload are verified; the React screens are not.
- **Cross-partition aggregation is done in JS**, because Cosmos rejects `GROUP BY` with aggregates
  on a cross-partition query. Fine at this corpus (~2 MB scanned). Per `guide/12_cosmos_db.md` §12,
  replace it with a rollup item when a dashboard load costs more than ~5,000 RU.
- **Review writes are last-writer-wins.** The audit array is append-only and must be read before it
  is appended to. Add an ETag precondition before two reviewers ever share a document.
- **`e2e_latency_ms` is per stage, not per pipeline.** On the `ocr` record it covers stage 1; on the
  `extract` record it covers stage 2 only. Summing stage-1 components against the stage-2 total —
  the obvious reading of the name — yields segments exceeding 100%. Analytics composes queue wait +
  stage 1 + stage 2 instead, and labels the result a floor: the hop between the stages (Event Grid
  on the markdown write, then the extract-queue wait) is not instrumented at all.
- `client/index.html` references `%VITE_ANALYTICS_ENDPOINT%`; without it the build warns and emits a
  broken `<script src="/umami">`. Harmless, noisy.
