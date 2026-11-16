/**
 * Characterization: the read side of the Documents API, as it behaves today.
 *
 *   GET /documents   list, filters, pending uploads, IVR sync on read
 *   GET /document    detail, merged fields + provenance, read SAS, Queued fallback
 *   GET /stats       dashboard totals
 *   GET /health      configured / not configured / Cosmos down
 *
 * The real server modules run against the in-memory Cosmos and blob fakes;
 * only the network edge is fake. Assertions name the fields the UI reads, so
 * a new field does not break a test but a changed status, filter or value
 * does. BUDGET tests count Cosmos and IVR calls: they fail when a change makes
 * a poll more expensive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@azure/cosmos", async () => (await import("./fakes/cosmos.js")).fakeCosmosModule());
vi.mock("@azure/storage-blob", async (orig) => ({
  ...(await orig<object>()),
  ...(await import("./fakes/blob.js")).fakeBlobModule(),
}));

const { handleSenderra } = await import("../../server/senderra/api.js");
const { fakeCosmos } = await import("./fakes/cosmos.js");
const { fakeBlobs } = await import("./fakes/blob.js");
const { fakeHttp, json } = await import("./fakes/http.js");
const { STAFF, WITH_IVR, as, configureEnv } = await import("./fakes/env.js");
const { CORPUS, corpus, extract, fields, gaps, ocr, review } = await import("./fakes/corpus.js");

const NOW = new Date("2026-10-08T12:00:00Z");
const docs = () => fakeCosmos.container("documents");

const get = (route: string, params: Record<string, string> = {}, ctx = as(STAFF)) =>
  handleSenderra("GET", route, new URLSearchParams(params), {}, ctx);

const list = async (params: Record<string, string> = {}) => {
  const res = await get("/documents", params);
  expect(res.status).toBe(200);
  return res.body as { ok: true; documents: any[]; runIds: string[]; docTypes: string[] };
};

const statusOf = (documents: any[]) => Object.fromEntries(documents.map((d) => [d.documentId, d.uiStatus]));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  configureEnv();
  fakeCosmos.reset();
  fakeBlobs.reset();
  fakeHttp.install();
  docs().seed(...corpus());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  expect(fakeHttp.unmatched, "unexpected outbound request").toEqual([]);
});

describe("GET /documents", () => {
  it("derives one UI status per document", async () => {
    const { documents } = await list();
    expect(statusOf(documents)).toEqual({
      [CORPUS.processed]: "Processed",
      [CORPUS.needsReview]: "Needs Review",
      [CORPUS.inHilReview]: "In HIL Review",
      [CORPUS.approved]: "Processed",
      [CORPUS.rejected]: "Failed",
      [CORPUS.processing]: "Processing",
      [CORPUS.ocrFailed]: "Failed",
      [CORPUS.triage]: "Triage",
      [CORPUS.routedToIvr]: "Routed to IVR",
      [CORPUS.gapsResolved]: "Processed",
      [CORPUS.duplicateOriginal]: "Processed",
      [CORPUS.duplicateCopy]: "Processed",
    });
  });

  it("summarises each document with the fields the list and dashboards read", async () => {
    const byId = Object.fromEntries((await list()).documents.map((d) => [d.documentId, d]));
    expect(byId[CORPUS.needsReview]).toMatchObject({
      documentId: "ui/needs-review-1",
      runId: "ui",
      docId: "needs-review-1",
      file: "needs-review-1.pdf",
      docType: "referralForm",
      pipelineStatus: "Succeeded",
      uiStatus: "Needs Review",
      confidence: 0.91,
      classifyConfidence: 0.98,
      pages: 2,
      needsReview: true,
      reviewReasons: ["low_field_score"],
      reviewFields: ["PatientDOB"],
      fieldCount: 3,
      fieldsNeedingReview: 1,
      costUsd: 0.014,
      modelId: "gpt-5.4-mini",
      modelSource: "active",
      latencyMs: 9000,
      minPageConfidence: 0.93,
      receivedAt: "2026-10-01T09:02:00Z",
      source: "upload",
      reviewStatus: null,
      reviewedBy: null,
      claimedBy: null,
      correctionCount: 0,
    });
    expect(byId[CORPUS.inHilReview]).toMatchObject({ claimedBy: "pacca.staff@emids.com", reviewStatus: "claimed" });
    // Before an extract exists, the summary falls back to the ocr item.
    expect(byId[CORPUS.processing]).toMatchObject({ docType: null, pipelineStatus: "Succeeded", costUsd: 0.01, latencyMs: 5000 });
  });

  it("sorts newest first and lists the run ids and doc types present", async () => {
    const body = await list();
    const received = body.documents.map((d) => d.receivedAt ?? "");
    expect(received).toEqual([...received].sort().reverse());
    expect(body.runIds).toEqual(["prod", "ui"]);
    expect(body.docTypes).toEqual(["other", "priorAuthRequest", "referralForm"]);
  });

  it("an approved, rejected or gaps-resolved document no longer needs review", async () => {
    const byId = Object.fromEntries((await list()).documents.map((d) => [d.documentId, d]));
    expect(byId[CORPUS.approved]).toMatchObject({ needsReview: false, fieldsNeedingReview: 0, correctionCount: 1, reviewStatus: "approved" });
    expect(byId[CORPUS.rejected]).toMatchObject({ needsReview: false, reviewStatus: "rejected" });
    expect(byId[CORPUS.gapsResolved]).toMatchObject({ needsReview: false, fieldsNeedingReview: 0, reviewedBy: "IVR Outreach" });
    expect(byId[CORPUS.needsReview]).toMatchObject({ needsReview: true, fieldsNeedingReview: 1 });
  });

  it("flags the later of two same-size, same-type documents as a duplicate", async () => {
    const byId = Object.fromEntries((await list()).documents.map((d) => [d.documentId, d]));
    expect(byId[CORPUS.duplicateOriginal].isDuplicate).toBeUndefined();
    expect(byId[CORPUS.duplicateCopy]).toMatchObject({ isDuplicate: true, duplicateOf: CORPUS.duplicateOriginal });
  });

  it("filters by runId, docType, search text and limit", async () => {
    expect((await list({ runId: "prod" })).documents.map((d) => d.documentId).sort()).toEqual(
      [CORPUS.gapsResolved, CORPUS.routedToIvr].sort()
    );
    expect((await list({ docType: "priorAuthRequest" })).documents.map((d) => d.documentId)).toEqual([CORPUS.inHilReview]);
    expect((await list({ q: "TRIAGE" })).documents.map((d) => d.documentId)).toEqual([CORPUS.triage]);
    expect((await list({ q: "priorauth" })).documents.map((d) => d.documentId)).toEqual([CORPUS.inHilReview]);
    expect((await list({ limit: "3" })).documents).toHaveLength(3);
    expect((await list({ limit: "0" })).documents).toHaveLength(12);
    expect((await list({ limit: "abc" })).documents).toHaveLength(12);
  });

  it("runIds and docTypes describe the filtered list, not the whole corpus", async () => {
    const body = await list({ runId: "prod" });
    expect(body.runIds).toEqual(["prod"]);
    expect(body.docTypes).toEqual(["referralForm"]);
  });

  it("needsReview=true is the HIL queue: unresolved, not routed to IVR", async () => {
    const ids = (await list({ needsReview: "true" })).documents.map((d) => d.documentId).sort();
    expect(ids).toEqual([CORPUS.inHilReview, CORPUS.needsReview].sort());
  });

  it("folds in a fresh upload that has no Cosmos record yet as Queued", async () => {
    fakeBlobs.add("docs-in", "ui/new-upload.pdf", { size: 4096, createdOn: "2026-10-08T11:59:00Z" });
    fakeBlobs.add("docs-in", `${CORPUS.processed}.pdf`); // already in Cosmos: not repeated
    fakeBlobs.add("docs-in", "ui/notes.txt"); // not a PDF: ignored
    const { documents } = await list();
    expect(documents[0]).toMatchObject({ documentId: "ui/new-upload", uiStatus: "Queued", fileBytes: 4096, source: "upload" });
    expect(documents.filter((d) => d.documentId === CORPUS.processed)).toHaveLength(1);
    expect(documents).toHaveLength(13);
  });

  it("lists only the upload run's prefix for pending uploads", async () => {
    fakeBlobs.add("docs-in", "prod/pipeline-upload.pdf");
    expect((await list()).documents.some((d) => d.documentId === "prod/pipeline-upload")).toBe(false);
  });

  it("still answers from Cosmos when the blob listing fails", async () => {
    fakeBlobs.failListings();
    expect((await list()).documents).toHaveLength(12);
  });

  it("does not call the IVR backend while outreach is disabled", async () => {
    await list();
    expect(fakeHttp.requests).toEqual([]);
  });

  it("with IVR on, settles a routed document whose call completed, and re-reads", async () => {
    configureEnv(WITH_IVR);
    fakeHttp.on("GET", "https://ivr.test/idp/outreach/4242", () =>
      json({ status: "COMPLETED", call_context_id: "call-1", fields: [{ field: "PatientDOB", value: "1975-05-05", status: "COLLECTED" }] })
    );
    const { documents } = await list();
    expect(statusOf(documents)[CORPUS.routedToIvr]).toBe("Processed");
    expect(fakeHttp.to("https://ivr.test/idp/outreach/4242")).toHaveLength(1);
    expect(fakeHttp.to("https://ivr.test/idp/outreach/4242")[0].headers.authorization).toBe("Bearer fake-ivr-key");

    const stored = docs().get("review", CORPUS.routedToIvr)!;
    expect(stored).toMatchObject({ status: "approved", reviewed_by: "IVR Outreach" });
    expect(stored.corrections.PatientDOB.value).toBe("1975-05-05");
    expect(docs().get("gaps", CORPUS.routedToIvr)).toMatchObject({
      gapStatus: "resolved",
      openCount: 0,
      gaps: { PatientDOB: { status: "collected", value: "1975-05-05", source: "patient", call_id: "call-1" } },
    });
  });

  it("with IVR on, leaves a routed document alone while the call is still running", async () => {
    configureEnv(WITH_IVR);
    fakeHttp.on("GET", "https://ivr.test/idp/outreach/4242", () => json({ status: "IN_PROGRESS", fields: [] }));
    const { documents } = await list();
    expect(statusOf(documents)[CORPUS.routedToIvr]).toBe("Routed to IVR");
    expect(docs().get("review", CORPUS.routedToIvr)!.status).toBe("routed_to_ivr");
  });

  it("with IVR on, an unreachable IVR backend does not break the list", async () => {
    configureEnv(WITH_IVR);
    fakeHttp.on("GET", "https://ivr.test/idp/outreach/4242", () => json({ detail: "down" }, 503));
    expect(statusOf((await list()).documents)[CORPUS.routedToIvr]).toBe("Routed to IVR");
  });

  it("answers 503 with the missing variables when not configured", async () => {
    configureEnv({ COSMOS_KEY: "", AZURE_STORAGE_KEY: "" });
    const res = await get("/documents");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, missing: ["COSMOS_KEY", "AZURE_STORAGE_KEY"] });
  });

  it("BUDGET: one poll costs one Cosmos query, and no IVR call while nothing is routed", async () => {
    configureEnv(WITH_IVR);
    fakeCosmos.reset();
    docs().seed(...corpus().filter((i) => i.documentId !== CORPUS.routedToIvr));
    await list({ needsReview: "true" });
    expect(docs().calls.filter((c) => c.op === "query")).toHaveLength(1);
    expect(docs().calls.filter((c) => c.op !== "query")).toEqual([]);
    expect(fakeHttp.requests).toEqual([]);
  });
});

describe("an upload, end to end", () => {
  // What the reviewer sees on each 5-second poll, from the browser's PUT to an
  // approval. The status must change on the very next poll after each write:
  // no caching or batching may delay it.
  it("shows Queued at once, then follows every pipeline and review write", async () => {
    fakeCosmos.reset();
    const id = "ui/new-referral";
    const statusNow = async () => (await list()).documents.find((d) => d.documentId === id)?.uiStatus;

    expect(await statusNow()).toBeUndefined();

    fakeBlobs.add("docs-in", `${id}.pdf`, { createdOn: "2026-10-08T11:59:58Z" });
    expect(await statusNow()).toBe("Queued");

    docs().seed(ocr(id, { recorded_at: "2026-10-08T12:00:10Z" }));
    expect(await statusNow()).toBe("Processing");

    docs().seed(extract(id, { needs_review: true, fields_needing_review: 1, recorded_at: "2026-10-08T12:00:30Z" }), fields(id));
    expect(await statusNow()).toBe("Needs Review");
    expect((await list({ needsReview: "true" })).documents.map((d) => d.documentId)).toEqual([id]);

    await handleSenderra("POST", "/review", new URLSearchParams(), { documentId: id, action: "claim" }, as(STAFF));
    expect(await statusNow()).toBe("In HIL Review");

    await handleSenderra("POST", "/review", new URLSearchParams(), { documentId: id, action: "approve" }, as(STAFF));
    expect(await statusNow()).toBe("Processed");
    expect((await list({ needsReview: "true" })).documents).toEqual([]);
    // The blob is still there, but it is never listed twice.
    expect((await list()).documents.filter((d) => d.documentId === id)).toHaveLength(1);
  });

  it("a pipeline failure shows as Failed on the next poll", async () => {
    fakeCosmos.reset();
    const id = "ui/bad-scan";
    fakeBlobs.add("docs-in", `${id}.pdf`);
    docs().seed(ocr(id, { status: "Failed" }));
    expect((await list()).documents.find((d) => d.documentId === id)?.uiStatus).toBe("Failed");
  });
});

describe("GET /document", () => {
  const detail = async (documentId: string) => get("/document", { documentId });

  it("needs a documentId", async () => {
    expect((await get("/document")).status).toBe(400);
  });

  it("is 404 for an id with neither a Cosmos record nor a blob", async () => {
    const res = await detail("ui/nothing-here");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: "No document ui/nothing-here." });
  });

  it("returns the summary, every stage item, the outreach hint and a PDF link", async () => {
    const res = await detail(CORPUS.needsReview);
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toMatchObject({
      ok: true,
      summary: { documentId: CORPUS.needsReview, uiStatus: "Needs Review", fieldsNeedingReview: 1 },
      ocr: { id: "ocr", page_count: 2, min_page_confidence: 0.93 },
      extract: { id: "extract", doc_type_predicted: "referralForm", needs_review: true },
      fields: { fields: { PatientName: { value: "Test Patient" }, PatientDOB: { value: null, needs_review: true } } },
      review: null,
      gaps: null,
      // A blank class-A field makes outreach visible; it stays off until IVR is configured.
      outreach: { visible: true, enabled: false, skipReason: "disabled", blankRequiredCount: 1 },
    });
    expect(body.pdfUrl).toMatch(/^https:\/\/fakeacct\.blob\.core\.windows\.net\/docs-in\/ui\/needs-review-1\.pdf\?/);
  });

  it("mints a read-only SAS for the ocr item's blob path", async () => {
    const body = (await detail(CORPUS.needsReview)).body as any;
    const url = new URL(body.pdfUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`https://fakeacct.blob.core.windows.net/docs-in/ui/needs-review-1.pdf`);
    expect(url.searchParams.get("sp")).toBe("r");
    expect(url.searchParams.get("sr")).toBe("b");
    expect(url.searchParams.get("se")).toBe("2026-10-08T12:30:00Z");
  });

  it("overlays reviewer corrections onto the fields, with provenance", async () => {
    docs().seed(
      fields(CORPUS.approved),
      review(CORPUS.approved, {
        status: "approved",
        corrections: { PatientDOB: { value: "1980-01-01", by: "pacca.staff@emids.com", at: "2026-10-01T09:06:00Z" } },
      })
    );
    const body = (await detail(CORPUS.approved)).body as any;
    expect(body.fields.fields.PatientDOB).toEqual({
      value: "1980-01-01",
      class: "A",
      needs_review: false,
      review_reasons: ["null_required"],
      provenance: { origin: "reviewer", by: "pacca.staff@emids.com", at: "2026-10-01T09:06:00Z" },
    });
    expect(body.summary.uiStatus).toBe("Processed");
  });

  it("overlays IVR-collected gap values, quoting the IVR script", async () => {
    const id = "prod/ivr-collected-1";
    docs().seed(
      ocr(id),
      extract(id, { needs_review: true }),
      fields(id),
      gaps(id, {
        gapStatus: "resolved",
        openCount: 0,
        request_id: 77,
        will_ask: [{ field: "PatientDOB", asked_as: "your date of birth" }],
        gaps: { PatientDOB: { status: "collected", value: "1990-02-02", source: "patient", captured_at: "2026-10-02T10:00:00Z", call_id: "c-9" } },
      })
    );
    const body = (await detail(id)).body as any;
    expect(body.fields.fields.PatientDOB).toMatchObject({
      value: "1990-02-02",
      needs_review: false,
      provenance: { origin: "ivr", by: "patient", at: "2026-10-02T10:00:00Z", askedAs: "your date of birth", callId: "c-9", requestId: 77 },
    });
  });

  it("marks a document as a duplicate of an earlier one with the same file size", async () => {
    const body = (await detail(CORPUS.duplicateCopy)).body as any;
    expect(body.summary).toMatchObject({
      isDuplicate: true,
      duplicateOf: CORPUS.duplicateOriginal,
      duplicateReason: "This document is a duplicate of dup-case, originally processed on 10/1/2026.",
    });
    expect(((await detail(CORPUS.duplicateOriginal)).body as any).summary.isDuplicate).toBeUndefined();
  });

  it("answers a blob with no Cosmos record yet as a Queued document", async () => {
    fakeBlobs.add("docs-in", "ui/just-uploaded.pdf", { size: 999, createdOn: "2026-10-08T11:58:00Z" });
    const res = await detail("ui/just-uploaded");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      summary: { documentId: "ui/just-uploaded", uiStatus: "Queued", pipelineStatus: "Queued", fileBytes: 999, receivedAt: "2026-10-08T11:58:00.000Z" },
      ocr: null,
      extract: null,
      fields: null,
      review: null,
      outreach: { visible: false, enabled: false },
    });
    expect((res.body as any).pdfUrl).toContain("/docs-in/ui/just-uploaded.pdf?");
  });

  it("falls back to <docs container>/<id>.pdf when the ocr item has no blob path", async () => {
    const id = "ui/no-blob-path";
    docs().seed(extract(id));
    const body = (await detail(id)).body as any;
    expect(new URL(body.pdfUrl).pathname).toBe("/docs-in/ui/no-blob-path.pdf");
    expect(body.summary.uiStatus).toBe("Processed");
  });

  it("with IVR on, syncs a routed document before answering", async () => {
    configureEnv(WITH_IVR);
    fakeHttp.on("GET", "https://ivr.test/idp/outreach/4242", () =>
      json({ status: "PARTIAL", fields: [{ field: "PatientDOB", value: "1966-06-06", status: "COLLECTED" }] })
    );
    const body = (await detail(CORPUS.routedToIvr)).body as any;
    expect(body.review.audit.at(-1)).toMatchObject({ action: "corrected", field: "PatientDOB", by: "IVR Outreach" });
    expect(body.fields.fields.PatientDOB).toMatchObject({ value: "1966-06-06", provenance: { origin: "ivr" } });
    // PARTIAL corrects but does not approve.
    expect(body.review.status).toBe("routed_to_ivr");
  });

  it("does not re-check IVR for a settled document", async () => {
    configureEnv(WITH_IVR);
    docs().seed(gaps(CORPUS.approved, { request_id: 1 }));
    await detail(CORPUS.approved);
    expect(fakeHttp.requests).toEqual([]);
  });
});

describe("GET /stats", () => {
  it("counts processed, pending review and reviewed documents", async () => {
    const { stats } = (await get("/stats")).body as any;
    expect(stats).toMatchObject({ documents: 12, processed: 5, pendingReview: 3, reviewed: 5, stpCount: 5 });
    expect(stats.stpRate).toBeCloseTo(5 / 12);
    // Ten extract items at $0.014 and two pages each.
    expect(stats.totalCostUsd).toBeCloseTo(0.14);
    expect(stats.pagesBilled).toBe(20);
    expect(stats.avgFieldScore).toBeCloseTo(0.91);
    expect(stats.byDocType).toEqual([
      { docType: "referralForm", count: 8 },
      { docType: "priorAuthRequest", count: 1 },
      { docType: "other", count: 1 },
    ]);
    expect(Object.fromEntries(stats.byStatus.map((s: any) => [s.status, s.count]))).toEqual({
      Processed: 5,
      "Needs Review": 1,
      "In HIL Review": 1,
      Failed: 2,
      Processing: 1,
      Triage: 1,
      "Routed to IVR": 1,
    });
  });

  it("BUDGET: one dashboard load costs one Cosmos query", async () => {
    docs().calls.length = 0;
    await get("/stats");
    expect(docs().calls.filter((c) => c.op === "query")).toHaveLength(1);
  });

  it("is all zeroes and nulls on an empty container", async () => {
    fakeCosmos.reset();
    const { stats } = (await get("/stats")).body as any;
    expect(stats).toMatchObject({ documents: 0, stpRate: null, avgFieldScore: null, totalCostUsd: 0, byDocType: [], byStatus: [] });
  });
});

describe("GET /health", () => {
  it("is public and reports configured: false without the Azure settings", async () => {
    configureEnv({ COSMOS_ENDPOINT: "", COSMOS_KEY: "", AZURE_STORAGE_ACCOUNT: "", AZURE_STORAGE_KEY: "" });
    const res = await get("/health", {}, {});
    expect(res).toEqual({
      status: 200,
      body: {
        ok: false,
        configured: false,
        missing: ["COSMOS_ENDPOINT", "COSMOS_KEY", "AZURE_STORAGE_ACCOUNT", "AZURE_STORAGE_KEY"],
        ivrTriggerEnabled: false,
        ivrUrlSet: false,
      },
    });
  });

  it("counts the items in the container once configured", async () => {
    const res = await get("/health", {}, {});
    expect(res).toEqual({
      status: 200,
      body: {
        ok: true,
        configured: true,
        cosmos: "senderra-idp/documents",
        storage: "fakeacct/docs-in",
        uploadRunId: "ui",
        items: corpus().length,
        ivrTriggerEnabled: false,
        ivrUrlSet: false,
      },
    });
  });

  it("reports IVR on only when both the flag and the URL are set", async () => {
    configureEnv({ PACCA_IVR_TRIGGER_ENABLED: "true" });
    expect(((await get("/health", {}, {})).body as any).ivrTriggerEnabled).toBe(false);
    configureEnv(WITH_IVR);
    expect((await get("/health", {}, {})).body).toMatchObject({ ivrTriggerEnabled: true, ivrUrlSet: true });
  });

  it("KNOWN BEHAVIOUR: a Cosmos failure is a 502 that echoes the raw error to the caller (TRACKER section 5)", async () => {
    docs().failNext("query", new Error("boom from cosmos"));
    const res = await get("/health", {}, {});
    expect(res).toEqual({ status: 502, body: { ok: false, error: "Cosmos read failed: Error: boom from cosmos" } });
  });
});
