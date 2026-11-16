# PACCA VISION V2.0 — MASTER CONTEXT & AGENT PROMPT PACKET

> **Target Model / Agent:** Fable 5.2 / Any External Autonomous Coding Agent  
> **Workspace / Repository Path:** `C:\Users\dhemachandran\.gemini\antigravity\brain\c75268c3-33d8-427d-9fac-3730bdcf44c0\scratch\audit-dev`  
> **Active Git Branch:** `feat/v2-enterprise-idp` (branched from `b9eff71`, includes merged PR #13 `fix/solutions-v2-bugs` and Phase A/B hardening)  
> **Local Dev Server:** Running on `http://localhost:3000/` (`pnpm dev` via Vite + server middleware)  
> **Local Test Suite:** `pnpm test` (Vitest), `pnpm run check` (TypeScript `tsc --noEmit` + ESM import checks)  
> **Demo Sign-In:** Email `pacca.admin@emids.com`, Password `Paccavision@123`

---

## 1. Executive Summary & Purpose

You are acting as a Principal IDP (Intelligent Document Processing) Architect & Full-Stack Engineer on **PACCA Vision V2.0**.
PACCA Vision is an enterprise Document Intelligence and Decision Platform built by emids, designed for complex healthcare and payer operations (e.g. Prior Authorization, Claims, Invoices, Clinical Records).

### Commercial & Deployment Reality (Crucial Boundary):
- **Deployment Model:** PACCA Vision is **NOT** a public multi-tenant SaaS where emids hosts the data or charges per-token/pay-as-you-go micro-transactions.
- **Customer-Hosted PaaS:** It is delivered as a **customer-hosted solution deployed directly into the client enterprise's dedicated Azure cloud subscription**.
- **Cost Ownership:** The enterprise client pays Azure directly for all compute, Cosmos DB RU/s, Azure Blob storage, and Azure OpenAI token costs.
- **Tenancy Definition:** Tenancy inside the platform represents **Internal Workspaces, Operating Entities, and Lines of Business (LOBs)** (e.g. *Medicare Advantage*, *Commercial Prior Auth*, *Medicaid Intake*), with authentication mapping directly to the client's **Microsoft Entra ID (Azure AD)**.

---

## 2. Platform Architecture: V1.0 Baseline vs. V2.0 Evolution

### 2.1 The V1.0 Foundation (Preserved & Live)
1. **Direct-to-Blob SAS Ingestion:** The browser calls `/api/senderra/upload-sas`, receives 15-minute SAS URLs, and uploads PDFs directly to Azure Blob Storage (`docs-in` container). No large binary payload ever proxies through Node/Vercel.
2. **Azure Function App Backend:** Azure Content Understanding (OCR) + Azure OpenAI extracts structured data into Cosmos DB.
3. **5-Item Cosmos Projection:** Stored in Cosmos DB `documents` container (`pk: /runId`):
   - `ocr`: Raw OCR tokens, text lines, and bounding-box coordinates.
   - `extract`: Normalized JSON extracted fields and confidence scores.
   - `fields`: Detailed field metadata, provenance pointers, and validation status.
   - `gaps`: Deterministic gaps (e.g. missing critical fields, ungrounded data).
   - `review`: Human-in-the-Loop review status (`claim`, `correct`, `approve`, `reject`), reviewer notes, and IVR outreach status.
4. **Human-in-the-Loop (`LiveWorkbench`):** Bounding-box viewer with side-by-side PDF preview, field editing, and IVR outreach triggers.
5. **Solutions Studio V2:** Dynamic document schema editor (`solutions` container, `pk: /typeKey`), compiled and provisioned via Azure Function App.

### 2.2 What Was Built & Merged in V2.0 (`feat/v2-enterprise-idp`)
1. **Hardening & Security (Phases A & B):**
   - Stripped client system messages, moved Function keys to `x-functions-key` headers, enforced Cosmos DB ETag `IfMatch` concurrency (`409 Conflict` on stale edits).
   - Rate limiting on failed logins, retry logic on user counter updates, local dev mock auth fallback (`Paccavision@123`).
2. **Solutions V2 PR #13 Merge (`f21aee0`):**
   - Strict Zod schema + regex validation on field and type keys.
   - Timeouts aligned with Function App provisioning budgets (`FA_TIMEOUT_MS = 110_000ms`).
3. **Multi-Tenant / Multi-Workspace Control Plane (M13):**
   - Added `tenantId` to JWT session claims and request contexts (`server/auth.ts`).
   - Workspace administration UI at `/admin/tenants` (`TenantAdminPage.tsx`).
4. **Multi-Document Transaction Packet Ledger (M01 / M10):**
   - Grouping documents into business cases/packets (`shared/transactions.ts`).
   - Control Tower UI at `/ops/tower` (`ControlTowerPage.tsx`) and Transaction Ledger at `/ops/transactions` (`TransactionLedgerPage.tsx`).
5. **Stage-Level Pipeline Studio (M07):**
   - Stage-level profile editor and simulator at `/pipeline-studio` (`PipelineStudioPage.tsx`).

---

## 3. Module Scope & Reality Checklist (M01 – M13)

When developing or refactoring, adhere to this exact scope:

| Module | Scope & Status | How to Implement / Extend |
|---|---|---|
| **M01: Ingestion & Formats** | **SA / Core** | Event-driven intake (Blob, SFTP, REST). Must support **PDF, DOCX, XML, and EDI 837/278/835**. Fast-path native parsers for DOCX and XML (skipping OCR). Deterministic X12 parser for EDI (never pass raw EDI to OCR/LLM). |
| **M02: OCR & Layout** | **Exists in V1** | Powered by Azure Content Understanding / Document Intelligence. Extracts words, lines, tables, and bounding boxes. |
| **M03: Classification & Studio** | **SA / Evolved** | Visual schema and prompt management evolved from `SolutionsV2`. Multi-page packet splitting (e.g. separating cover sheets, forms, and clinical notes). |
| **M04: Packet Correlation & Entity Linker** | **SA / De-buzzed** | **DO NOT build a Neo4j graph.** It is a relational cross-document reconciler across a multi-file packet (Form + Clinical Notes + Labs). Detects discrepancies (e.g. form says "Right Knee", notes say "Left Knee") with bounding-box citations. |
| **M05: Grounding & Rules Engine** | **SA / Two-Tier** | **Tier 1 (Deterministic):** 10-digit NPI Luhn checks, ICD-10/CPT reference codebook lookups, 30-day date windows.<br>**Tier 2 (Semantic Clinical):** Prior authorization medical necessity checks with mandatory source document citations. |
| **M06: Model Center** | **Partially Exists** | Per-document-type model selection (e.g. GPT-4o for complex narratives, smaller fast models for standard forms), PTU rate limits, and Azure OpenAI Zero Data Retention (ZDR) validation. |
| **M07: Pipeline Studio** | **Scoped Profile Engine** | **DO NOT build a drag-and-drop node canvas.** It is a stage-level configuration profile editor (Intake $\rightarrow$ Format Parser $\rightarrow$ Classification $\rightarrow$ Extraction $\rightarrow$ Rules $\rightarrow$ HIL $\rightarrow$ Delivery). |
| **M08: Golden Datasets** | **SA / Benchmark** | Curated ground-truth test packets for historical simulation to measure STP% and field F1 before promoting schema changes. |
| **M09: Integration Hub** | **Merged into M01** | Outbound export adapters: FHIR/HL7 bundles, EHR writeback webhooks. |
| **M10: Control Tower & Transactions** | **Built in V2** | Real-time SLA monitors, queue depth tracking, packet tracing, and dead-letter auto-recovery. |
| **M11: Intelligent HIL** | **Exists in V1** | Multi-file packet review with side-by-side document tabs and bounding-box highlighting. |
| **M12: Enterprise Analytics** | **SA** | Operational KPIs: Straight-Through Processing (STP) rate, HIL touch times, and departmental AI cost attribution. |
| **M13: Enterprise Workspaces** | **Built in V2** | Line-of-Business workspace management, Entra ID SSO integration, Key Vault Customer-Managed Keys (CMK). |

---

## 4. Key File Map

### Backend (`server/`)
- `server/senderra/v2Engine.ts`: Transaction packet assembler, cross-doc discrepancy checks, Control Tower telemetry.
- `server/senderra/api.ts`: Central API dispatcher routing `/api/senderra/*` endpoints with `ROUTE_POLICY` role enforcement.
- `server/senderra/cosmos.ts`: Azure Cosmos DB client, container handles (`documents`, `users`, `solutions`), ETag concurrency handling.
- `server/senderra/users.ts`: Authentication, scrypt password hashing, lockout logic, local dev auth fallback.
- `server/solutionsV2Api.ts`: Dynamic document type definitions, Zod validation, Azure Function App provisioning integration.
- `server/auth.ts`: JWT session signing/verification (HS256 via `node:crypto`), role definitions (`STAFF`, `DEVELOPER`, `ADMIN`), `RequestContext`.

### Shared Schemas (`shared/`)
- `shared/transactions.ts`: Zod schemas and TypeScript types for `TransactionSummary`, `TransactionDetail`, `PacketDocument`, `CrossDocFinding`.
- `shared/roles.ts`: User role definitions and navigation hierarchy.

### Frontend (`client/src/`)
- `client/src/pages/ops/ControlTowerPage.tsx`: Operational command center with SLA burn-down, throughput, and error rates.
- `client/src/pages/ops/TransactionLedgerPage.tsx`: Transaction packet list and inspector with cross-document discrepancy drawer.
- `client/src/pages/studios/PipelineStudioPage.tsx`: Stage-level pipeline profile configuration and simulated execution runner.
- `client/src/pages/admin/TenantAdminPage.tsx`: Enterprise Line-of-Business workspace management.
- `client/src/senderra/SolutionsV2.tsx`: Visual document type and field schema editor.
- `client/src/senderra/LiveWorkbench.tsx`: Human-in-the-Loop review interface.

### Tests (`tests/`)
- `tests/server/routes-v2.test.ts`: Transaction packet and Control Tower API tests.
- `tests/server/routes-solutions.test.ts`: 27 comprehensive tests for solutions provisioning, ETag locks, and timeouts.
- `tests/server/login.test.ts`: Session, password hashing, and rate-limiting tests.

---

## 5. Development & Verification Commands

```powershell
# Check TypeScript types and ESM import compliance
pnpm.cmd run check

# Run the test suite
pnpm.cmd test

# Run the dev server
pnpm.cmd run dev
```

> **Rules of Engagement:**
> 1. Keep all changes local—**do not push to remote Git**.
> 2. Ensure `pnpm run check` and `pnpm test` pass with zero errors after every modification.
> 3. Preserve existing working code, docstrings, and tests.
