/**
 * Characterization: the write side, as it behaves today.
 *
 *   POST /review        claim, release, correct, approve, reject
 *   POST /upload-sas    validation, naming, the SAS grants
 *
 * Real server modules against the in-memory Cosmos; SAS minting is the real
 * SDK (local HMAC). See routes-documents.test.ts for the conventions.
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
const { fakeHttp } = await import("./fakes/http.js");
const { ADMIN, EMAIL, STAFF, as, configureEnv } = await import("./fakes/env.js");
const { CORPUS, corpus, gaps } = await import("./fakes/corpus.js");

const NOW = new Date("2026-10-08T12:00:00Z");
const docs = () => fakeCosmos.container("documents");

const post = (route: string, body: Record<string, unknown>, ctx = as(STAFF)) =>
  handleSenderra("POST", route, new URLSearchParams(), body, ctx);
const reviewAction = (documentId: string, action: string, extra: Record<string, unknown> = {}, ctx = as(STAFF)) =>
  post("/review", { documentId, action, ...extra }, ctx);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  configureEnv();
  fakeCosmos.reset();
  fakeBlobs.reset();
  fakeHttp.install();
  docs().seed(...corpus());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  expect(fakeHttp.requests, "the review and upload routes call nothing outside").toEqual([]);
});

describe("POST /review: validation", () => {
  it.each([
    [{ action: "claim" }, "documentId is required."],
    [{ documentId: CORPUS.needsReview, action: "delete" }, "action must be claim, release, correct, approve or reject."],
    [{ documentId: CORPUS.needsReview }, "action must be claim, release, correct, approve or reject."],
    [{ documentId: CORPUS.needsReview, action: "route_to_ivr" }, "action must be claim, release, correct, approve or reject."],
    [{ documentId: CORPUS.needsReview, action: "correct" }, "action 'correct' needs a non-empty corrections object."],
    [{ documentId: CORPUS.needsReview, action: "correct", corrections: {} }, "action 'correct' needs a non-empty corrections object."],
    [{ documentId: CORPUS.needsReview, action: "correct", corrections: ["x"] }, "action 'correct' needs a non-empty corrections object."],
  ])("%j -> 400", async (body, error) => {
    const res = await post("/review", body);
    expect(res).toEqual({ status: 400, body: { ok: false, error } });
    expect(docs().calls.filter((c) => c.op === "upsert")).toEqual([]);
  });

  it("answers 503 when Cosmos is not configured", async () => {
    configureEnv({ COSMOS_ENDPOINT: "" });
    expect((await reviewAction(CORPUS.needsReview, "claim")).status).toBe(503);
  });
});

describe("POST /review: actions", () => {
  it("claim creates the review item, signed by the session user (snapshot)", async () => {
    const res = await reviewAction(CORPUS.needsReview, "claim", { by: "spoofed@emids.com" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, review: { status: "claimed", claimed_by: EMAIL[STAFF] } });
    expect(docs().get("review", CORPUS.needsReview)).toMatchObject({
      status: "claimed",
      claimed_by: EMAIL[STAFF],
      claimed_at: NOW.toISOString(),
      audit: [{ action: "claimed", by: EMAIL[STAFF], at: NOW.toISOString() }],
    });
  });

  it("release clears the claim and appends to the audit", async () => {
    await reviewAction(CORPUS.inHilReview, "release");
    expect(docs().get("review", CORPUS.inHilReview)).toMatchObject({
      status: "pending",
      claimed_by: null,
      claimed_at: null,
      audit: [{ action: "released", by: EMAIL[STAFF] }],
    });
  });

  it("correct records old and new values and mirrors them onto the fields item", async () => {
    const res = await reviewAction(CORPUS.needsReview, "correct", { corrections: { PatientDOB: "1970-07-07", NewField: "x" } });
    expect(res.status).toBe(200);
    const stored = docs().get("review", CORPUS.needsReview)!;
    expect(stored.status).toBe("pending");
    expect(stored.corrections).toEqual({
      PatientDOB: { value: "1970-07-07", by: EMAIL[STAFF], at: NOW.toISOString() },
      NewField: { value: "x", by: EMAIL[STAFF], at: NOW.toISOString() },
    });
    expect(stored.audit).toEqual([
      { at: NOW.toISOString(), by: EMAIL[STAFF], action: "corrected", field: "PatientDOB", old_value: null, new_value: "1970-07-07" },
      { at: NOW.toISOString(), by: EMAIL[STAFF], action: "corrected", field: "NewField", old_value: null, new_value: "x" },
    ]);
    const f = docs().get("fields", CORPUS.needsReview)!.fields;
    expect(f.PatientDOB).toMatchObject({ value: "1970-07-07", needs_review: false, review_reasons: ["null_required"] });
    expect(f.NewField).toEqual({ value: "x", class: "A", needs_review: false });
  });

  it("drops a correction equal to the previous correction, but not one equal to the extracted value", async () => {
    await reviewAction(CORPUS.needsReview, "correct", { corrections: { PatientDOB: "1970-07-07" } });
    await reviewAction(CORPUS.needsReview, "correct", { corrections: { PatientDOB: "1970-07-07", PatientName: "Test Patient" } });
    const audit = docs().get("review", CORPUS.needsReview)!.audit;
    expect(audit.map((a: any) => `${a.action}:${a.field}:${a.old_value}`)).toEqual([
      "corrected:PatientDOB:null",
      "corrected:PatientName:null",
    ]);
  });

  it("approve settles the review, closes open gaps, and leaves the extract item untouched", async () => {
    docs().seed(gaps(CORPUS.needsReview, { gaps: { PatientDOB: { status: "open" }, MemberID: { status: "collected", value: "M1" } } }));
    const extractBefore = docs().get("extract", CORPUS.needsReview);
    const res = await reviewAction(CORPUS.needsReview, "approve", { note: "looks right", corrections: { PatientDOB: "1970-07-07" } });
    expect(res.body).toMatchObject({ ok: true, review: { status: "approved", corrections: { PatientDOB: { value: "1970-07-07" } } } });
    expect(docs().get("review", CORPUS.needsReview)).toMatchObject({
      status: "approved",
      reviewed_by: EMAIL[STAFF],
      reviewed_at: NOW.toISOString(),
      note: "looks right",
    });
    expect(docs().get("gaps", CORPUS.needsReview)).toMatchObject({
      gapStatus: "resolved",
      openCount: 0,
      gaps: { PatientDOB: { status: "settled" }, MemberID: { status: "collected", value: "M1" } },
    });
    expect(docs().get("extract", CORPUS.needsReview)).toEqual(extractBefore);
  });

  it("reject keeps the note and does not touch gaps", async () => {
    docs().seed(gaps(CORPUS.needsReview));
    await reviewAction(CORPUS.needsReview, "reject", { note: "wrong patient" });
    expect(docs().get("review", CORPUS.needsReview)).toMatchObject({ status: "rejected", note: "wrong patient" });
    expect(docs().get("gaps", CORPUS.needsReview)!.gapStatus).toBe("open");
  });

  it("the list and detail reflect an approval at once", async () => {
    await reviewAction(CORPUS.needsReview, "approve");
    const list = (await handleSenderra("GET", "/documents", new URLSearchParams({ needsReview: "true" }), {}, as(STAFF))).body as any;
    expect(list.documents.map((d: any) => d.documentId)).toEqual([CORPUS.inHilReview]);
  });

  it("a review of a document with no other items still writes a review item", async () => {
    await reviewAction("ui/never-processed", "claim");
    expect(docs().get("review", "ui/never-processed")).toMatchObject({ runId: "ui", docId: "never-processed", status: "claimed" });
  });

  it("returns 409 when the review was concurrently updated (ETag 412 conflict)", async () => {
    // Seed initial review item
    await reviewAction(CORPUS.needsReview, "claim");

    // Inject a 412 Precondition Failed error on the next replace/upsert
    const err = Object.assign(new Error("Precondition Failed"), { code: 412, statusCode: 412 });
    docs().failNext("upsert", err);

    const res = await reviewAction(CORPUS.needsReview, "approve");
    expect(res.status).toBe(409);
    expect((res.body as any).error).toContain("updated by another user or process");
  });

  it("a failed side-write (fields) is logged and does not fail the review", async () => {
    docs().failNext("upsert", new Error("fields write failed"), { skip: 1 });
    const res = await reviewAction(CORPUS.needsReview, "correct", { corrections: { PatientDOB: "1970-07-07" } });
    expect(res.status).toBe(200);
    expect(docs().get("review", CORPUS.needsReview)!.corrections.PatientDOB.value).toBe("1970-07-07");
    expect(docs().get("fields", CORPUS.needsReview)!.fields.PatientDOB.value).toBeNull();
  });

  it("KNOWN BEHAVIOUR: a failed review write is a 500 that echoes the raw error (TRACKER section 5)", async () => {
    docs().failNext("upsert", new Error("review write failed"));
    const res = await reviewAction(CORPUS.needsReview, "claim");
    expect(res).toEqual({ status: 500, body: { ok: false, error: "Error: review write failed" } });
  });

  it("KNOWN BEHAVIOUR: last writer wins, a second claim silently takes over (TRACKER section 6)", async () => {
    await reviewAction(CORPUS.needsReview, "claim", {}, as(STAFF));
    const res = await reviewAction(CORPUS.needsReview, "claim", {}, as(ADMIN));
    expect(res.status).toBe(200);
    expect(docs().get("review", CORPUS.needsReview)!.claimed_by).toBe(EMAIL[ADMIN]);
  });
});

describe("POST /upload-sas", () => {
  const upload = (body: Record<string, unknown>) => post("/upload-sas", body);

  it.each([
    [{}, "Provide files: [{ name }]."],
    [{ files: [] }, "Provide files: [{ name }]."],
    [{ files: "a.pdf" }, "Provide files: [{ name }]."],
    [{ files: Array.from({ length: 51 }, (_, i) => ({ name: `f${i}.pdf` })) }, "At most 50 files per request."],
    [{ files: [{ name: "a.pdf" }], runId: "../etc" }, "runId may only contain letters, digits, dot, dash and underscore."],
    [{ files: [{ name: "a.pdf" }], runId: "a/b" }, "runId may only contain letters, digits, dot, dash and underscore."],
    [{ files: [{ name: "a.pdf" }, { name: "  " }] }, "Every file needs a name."],
    [{ files: [{}] }, "Every file needs a name."],
  ])("%j -> 400", async (body, error) => {
    expect(await upload(body)).toEqual({ status: 400, body: { ok: false, error } });
  });

  it("accepts exactly 50 files", async () => {
    const res = await upload({ files: Array.from({ length: 50 }, (_, i) => `f${i}.pdf`) });
    expect(res.status).toBe(200);
    expect((res.body as any).grants).toHaveLength(50);
  });

  it("grants one SAS per file under the default run, with a pipeline-safe name", async () => {
    const res = await upload({ files: [{ name: "Prior Auth (1).pdf" }, "fax__scan.PDF", "no-extension"] });
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toMatchObject({ ok: true, runId: "ui", container: "docs-in", model: null });
    expect(body.grants.every((g: any) => g.container === "docs-in" && g.expiresInSeconds === 900)).toBe(true);
    expect(body.grants.map((g: any) => g.documentId)).toEqual(["ui/Prior_Auth_1_", "ui/fax_scan", "ui/no-extension"]);
    expect(body.grants.map((g: any) => g.blobName)).toEqual(["ui/Prior_Auth_1_.pdf", "ui/fax_scan.PDF", "ui/no-extension.pdf"]);
  });

  it("the SAS can create and write one blob for 15 minutes, nothing else", async () => {
    const grant = ((await upload({ files: ["a.pdf"] })).body as any).grants[0];
    const url = new URL(grant.uploadUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://fakeacct.blob.core.windows.net/docs-in/ui/a.pdf");
    expect(url.searchParams.get("sp")).toBe("cw");
    expect(url.searchParams.get("sr")).toBe("b");
    expect(url.searchParams.get("st")).toBe("2026-10-08T11:55:00Z");
    expect(url.searchParams.get("se")).toBe("2026-10-08T12:15:00Z");
    expect(url.searchParams.get("rsct")).toBe("application/pdf");
    expect(grant.expiresInSeconds).toBe(900);
  });

  it("uses a valid runId from the body", async () => {
    const body = (await upload({ files: ["a.pdf"], runId: " batch-7.1_x " })).body as any;
    expect(body.runId).toBe("batch-7.1_x");
    expect(body.grants[0].documentId).toBe("batch-7.1_x/a");
  });

  it("answers 503 with the missing variables when storage is not configured", async () => {
    configureEnv({ AZURE_STORAGE_KEY: "" });
    expect(await upload({ files: ["a.pdf"] })).toMatchObject({ status: 503, body: { ok: false, missing: ["AZURE_STORAGE_KEY"] } });
  });

  it("writes nothing to Cosmos", async () => {
    docs().calls.length = 0;
    await upload({ files: ["a.pdf"] });
    expect(docs().calls).toEqual([]);
  });
});
