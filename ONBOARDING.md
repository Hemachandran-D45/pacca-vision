# Onboarding — PACCA IDP

How we work in this repo: setup, branches, commits, PRs and tests. It applies to **people and to
coding agents** (Claude Code or any other). Read it before your first commit. `CLAUDE.md` imports
this file, so Claude Code loads it automatically.

---

## 1. The repo in one minute

PACCA IDP is the operations UI and API for the PACCA intelligent document processing pipeline:
upload, documents, HIL review, IVR outreach, solutions (doc types), analytics and observability.

| Path | What |
|---|---|
| `client/` | React 19 + Vite single-page app |
| `server/` | Express API. `server/app.ts` builds the app (`createApp`), `server/index.ts` starts it, `server/senderra/api.ts` is the dispatcher and `ROUTE_POLICY` |
| `shared/` | Code used by both sides (roles, page ↔ route map) |
| `api/` | **Vercel-only** adapters around the same server code. Not in the production image |
| `tests/` | vitest tests (`tests/server/`) |
| `analyzers/` | Doc-type catalog, schemas and prompts read at runtime |
| `docs/` | Architecture, deploy guide, [TRACKER.md](docs/TRACKER.md) |

**Where it runs:**

| Branch | Deployed to | Web app resources | Data plane | Used for |
|---|---|---|---|---|
| `dev` | Vercel | Vercel | `pacca-vision-rg` | Test link |
| `main` | Azure Container Apps | `pacca-idp-rg` | `senderra-idp-rg` | Production ([docs/deploy/](docs/deploy/README.md)) |

The two environments have separate Cosmos, storage and pipeline. They share Azure OpenAI and the
IVR backend.

---

## 2. Setup

```bash
nvm use                                   # Node 22 (.nvmrc); the Azure SDKs need >= 22
corepack enable                           # pnpm version comes from package.json
pnpm install --frozen-lockfile
cp env.example .env.local                 # ask a maintainer for values; never paste secrets in chat/issues/PRs
pnpm dev                                  # http://localhost:3000
```

| Command | Does | Run it |
|---|---|---|
| `pnpm check` | ESM-import guard + `tsc --noEmit` | before every commit |
| `pnpm test` | vitest | before every commit |
| `pnpm build` | SPA → `dist/public`, server → `dist/index.js`, prompts → `dist/prompts` | when you touch the build or server entry |
| `pnpm start` | Runs the production server locally | to try the build |
| `docker build -t pacca-idp-web .` | The production image | when you touch `Dockerfile`, `server/app.ts` / `server/index.ts`, dependencies or `analyzers/` |

---

## 3. Branches

- **`main` is production.** It only changes by a PR from `dev` (a release), or by a `fix/` PR for
  a hotfix. No direct commits, no force-pushes.
- **`dev` is integration** and the Vercel test link. Work reaches it by PR.
- **Work branches** come off `dev`, are short-lived, and are named
  `feat/<scope>-<what>`, `fix/<scope>-<what>`, `docs/<what>`, `refactor/<what>`, `chore/<what>`.
- **Hotfix:** branch `fix/...` off `main` → PR to `main` → then merge `main` back into `dev` so
  the fix is not lost at the next release.
- **Before opening a PR,** rebase your own branch on `dev`. Never rebase a branch someone else has
  pulled.

**Agents:** commit locally only. **Never push**, open, merge or close PRs, delete or move remote
branches, or touch Azure/Vercel resources, unless the human explicitly asks for that specific
action. A human reviews and pushes.

---

## 4. Commits

**One task per commit, and every commit leaves the suite green.** That is the property worth
protecting. It lets a reviewer read one commit in isolation, and it lets any single commit be
reverted without taking unrelated work with it. A commit that only passes once the *next* one
lands is not atomic, whatever its size.

Keep a change and the test that covers it in the same commit. Splitting them leaves one commit
where the behaviour is unproven and another that proves something already shipped.

Write the message for the person who runs `git log` in six months and needs to know *why*. Put
the facts they cannot recover from the diff in the body: which SDK or platform limit forced the
change, how a bug was reproduced, which assertion was passing vacuously, what you ruled out. The
diff already shows what changed.

### Format

```
<type>(<scope>): <summary in the imperative, <= 72 chars>

<body: what changed and why. Then anything a reviewer must know:
behaviour changes, new env vars or settings, infra steps, how it was
verified, and what is deliberately left out.>
```

- **Types:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- **Scopes:** the area touched. For example: `server`, `auth`, `documents`, `review`, `ivr`,
  `solutions`, `observability`, `ui`, `deploy`, `build`.

Example from this repo (`a201e8d`):

```
fix(server): stop one failing request from killing the Express process

Express 4 does not catch a rejected async route handler; the rejection is
unhandled and Node 22 exits on unhandled rejections, so a single throw took
down the whole server and every in-flight request with it.

Reproduced on `pnpm start`: PATCH /api/solutions-v2 while
analyzers/out/pacca_guidance.json is not writable throws EACCES ...
Before: the connection drops and the process exits. After: that request
gets a 500 and the server keeps serving.
```

### Rules

- `pnpm check && pnpm test` pass on **every** commit, not just the last one. Check a whole branch
  with `git rebase -x "pnpm check && pnpm test" dev`.
- **No AI attribution.** No `Co-Authored-By:` trailers for AI tools, and no "Generated with …"
  lines, in commits or PR descriptions. The human who commits owns the change.
- **Never commit secrets** or `.env*`. **Never hardcode a key as a fallback**
  (`process.env.X || "<key>"`); fail with a clear error instead. Real PHI never goes in the repo:
  test documents must be synthetic.
- **Docs move with code.** If a commit changes behaviour, configuration or a decision, update the
  matching doc in the same commit:
  - a new env var → `env.example` and [docs/deploy/03](docs/deploy/03_secrets_and_env.md)
  - open work → [docs/TRACKER.md](docs/TRACKER.md)

---

## 5. Pull requests

- **Target:** feature/fix branches → `dev`. Releases: `dev` → `main`. Hotfixes: `fix/...` → `main`.
- **More than one commit:** write a PR body. GitHub only pre-fills the description from a single
  commit, so on a multi-commit branch the reasoning is otherwise scattered across messages a
  reviewer has to reassemble. Lead with what changed and why, then anything reviewer-visible:
  new config keys, behaviour changes, defects found along the way.
- **Exactly one commit:** no separate body needed. GitHub pre-fills it from that commit, so a
  hand-written body just duplicates it and then drifts.
- **Before requesting review:**
  - [ ] `pnpm check` and `pnpm test` pass on every commit
  - [ ] `docker build` passes, if you touched the Dockerfile, `server/app.ts` / `server/index.ts`, dependencies or
    `analyzers/`
  - [ ] new or changed env vars are in `env.example` and `docs/deploy/03`, and the Vercel owner
    knows
  - [ ] `docs/TRACKER.md` is updated
  - [ ] UI changes have a screenshot in the PR
- **Review:** at least one approval from someone who did not write the change.
- **Merge** with *Create a merge commit* (as the repo does today). **Do not squash:** squashing
  throws away the one-task-per-commit history this guide asks for.

---

## 6. Tests

- **Where:** `tests/server/*.test.ts`, run by vitest in a Node environment (`vitest.config.ts`).
  Do not create `tests/build/`: `.gitignore` ignores every `build/` directory, so files there are
  silently never committed.
- **Patterns:**

| Testing | Copy | How |
|---|---|---|
| An API route's logic or policy | `policy.test.ts` | Mock Azure modules with `vi.mock("../../server/senderra/cosmos.js", …)`, set config with `vi.stubEnv`, sign in with `signSession` + `sessionCookie` + `contextFrom`, and call `handleSenderra` directly. No server, no network |
| A route's behaviour end to end (what the UI sees, what is written) | `routes-documents.test.ts` | `vi.mock("@azure/cosmos", …fakeCosmosModule())` (+ blob / file-share fakes), seed `tests/server/fakes/corpus.ts`, `configureEnv()`, call `handleSenderra` as a role from `fakes/env.ts`. Assert the fields the UI reads (`toMatchObject`), not whole bodies; no snapshots. Add a BUDGET test (count `docs().calls`) when a change touches a polled route |
| HTTP behaviour (status codes, headers, crashes) | `express-app.test.ts` | `createApp(tmpStaticDir).listen(0)` and `fetch` it. Mock the module that should fail |
| The production build or process | `server-bundle.test.ts` | Run `pnpm run build:server` (~0.3 s), then check `dist/` or spawn `node dist/index.js` |
| Secrets | `secrets.test.ts` | Already scans all source; keep it green |

- **Prove the test works:** before committing a regression test, run it against the code
  **without** your fix and see it fail. Say so in the commit body.
- **Offline, always.** `tests/setup/no-network.ts` fails any test that opens a non-loopback
  connection. Fake the call (`fakes/http.ts` for `fetch`) instead of reaching Azure, OpenAI or IVR.

**What must come with a test:**

| Change | Test |
|---|---|
| Bug fix | A test that **fails before the fix** and passes after |
| New API route | An entry in `ROUTE_POLICY` (`server/senderra/api.ts`) and a case in `policy.test.ts`. If a page calls it, add it to `PAGE_API_ROUTES` in `shared/roles.ts` (`page-routes.test.ts` enforces this) |
| Role or permission change | Policy and page-route tests for every affected role |
| Pure logic (status mapping, cost math, parsers) | Unit tests for it |

**Not covered yet:** client components, end-to-end and container tests. They are planned in
[TRACKER §3](docs/TRACKER.md#3-tests-and-the-ci-gate). Until they exist, describe in the commit
body exactly how you verified the change by hand.

**CI gate:** every PR into `main` runs `pnpm check` and `pnpm test` in GitHub Actions
(`.github/workflows/ci.yml`). A secret scan and a Docker build + smoke test come next
([TRACKER §4](docs/TRACKER.md#4-cicd-after-section-3)).

---

## 7. Code rules that bite

- **Relative imports in `server/` and `api/` end in `.js`** (`from "./cosmos.js"`). `tsc` does
  not catch a missing extension, and Vercel crashes at load. `pnpm check` enforces this.
- **Server secrets are never `VITE_*`.** Vite copies `VITE_*` into the browser bundle.
- **Every API route goes through `ROUTE_POLICY`.** The acting user comes from the session, never
  from the request body.
- **Async Express routes are wrapped in `safe()`** (`server/app.ts`). An unhandled rejection
  kills the process.
- **Configuration comes only from env vars.** Nothing is read from files in the image except
  `analyzers/` and `dist/prompts`.
- **PHI:** never log document contents or extracted field values, and never send them to a
  service without a BAA.
- **Do not add `manualChunks`** to the Vite build. It renders a blank page (see README).

---

## 8. For coding agents

1. Read this file and [docs/TRACKER.md](docs/TRACKER.md) before starting.
2. Investigate before you change. Reproduce bugs before fixing them, and say how.
3. Make small commits that follow §4, and run `pnpm check && pnpm test` before each one.
4. Report honestly: what you verified, what you could not verify, what you skipped. Never invent
   test results or commit hashes.
5. **Ask first** before deleting files you did not create, changing Azure or Vercel resources,
   rotating keys, or anything else that leaves the machine. Never push (§3).
