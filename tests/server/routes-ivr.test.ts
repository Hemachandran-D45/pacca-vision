/**
 * Characterization: IVR outreach, as it behaves today.
 *
 *   POST /ivr-trigger     place a call (or record why not) for a document's gaps
 *   GET  /ivr-outreach    the IVR backend's view of one request
 *   POST /ivr-writeback   the IVR system's callback (machine route, x-api-key)
 *   POST /ivr-webhook     the same handler, older name
 *
 * The IVR backend is the fake `fetch`; nothing places a real call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@azure/cosmos", async () => (await import("./fakes/cosmos.js")).fakeCosmosModule());

const { handleSenderra } = await import("../../server/senderra/api.js");
const { contextFrom } = await import("../../server/auth.js");
const { fakeCosmos } = await import("./fakes/cosmos.js");
const { fakeHttp, json } = await import("./fakes/http.js");
const { EMAIL, STAFF, WITH_IVR, as, configureEnv } = await import("./fakes/env.js");
const { CORPUS, corpus, extract, fields, gaps, ocr } = await import("./fakes/corpus.js");

const NOW = new Date("2026-10-08T12:00:00Z");
const TRIGGER = "https://ivr.test/idp/trigger-outreach";
const outreachUrl = (id: string | number) => `https://ivr.test/idp/outreach/${id}`;
const docs = () => fakeCosmos.container("documents");

const trigger = (body: Record<string, unknown>, ctx = as(STAFF)) =>
  handleSenderra("POST", "/ivr-trigger", new URLSearchParams(), body, ctx);
const writeback = (body: Record<string, unknown>, headers: Record<string, string> = {}, route = "/ivr-writeback") =>
  handleSenderra("POST", route, new URLSearchParams(), body, contextFrom(headers));

/** A needs-review document with an open, patient-askable gap. */
const DOC = "ui/ivr-candidate-1";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  configureEnv();
  fakeCosmos.reset();
  fakeHttp.install();
  docs().seed(...corpus(), ocr(DOC), extract(DOC, { needs_review: true }), fields(DOC), gaps(DOC));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  expect(fakeHttp.unmatched, "unexpected outbound request").toEqual([]);
});

describe("POST /ivr-trigger", () => {
  it("needs a documentId", async () => {
    expect(await trigger({})).toEqual({ status: 400, body: { ok: false, error: "documentId is required." } });
  });

  it("KNOWN BEHAVIOUR: with outreach disabled, records 'disabled' on the gaps item and still answers uiStatus 'Routed to IVR'", async () => {
    const res = await trigger({ documentId: DOC });
    expect(res).toEqual({
      status: 200,
      body: { ok: true, trigger_status: "disabled", triggered_at: "2026-10-08T12:00:00Z", skipReason: "disabled", patched: true, uiStatus: "Routed to IVR" },
    });
    expect(fakeHttp.requests).toEqual([]);
    expect(docs().get("gaps", DOC)).toMatchObject({ trigger_status: "disabled", triggered_at: "2026-10-08T12:00:00Z", gapStatus: "open" });
    expect(docs().get("review", DOC)).toBeUndefined();
  });

  it("with no gaps, extract or fields item, skips without calling anyone", async () => {
    configureEnv(WITH_IVR);
    const res = await trigger({ documentId: "ui/unknown" });
    expect(res).toEqual({ status: 200, body: { ok: true, trigger_status: "skipped_no_gaps", skipReason: "skipped_no_gaps", patched: false } });
    expect(fakeHttp.requests).toEqual([]);
  });

  describe("with outreach on", () => {
    beforeEach(() => configureEnv(WITH_IVR));

    it("posts the stored gaps item, patches it with the outcome, and routes the review", async () => {
      fakeHttp.on("POST", TRIGGER, () =>
        json({ accepted: true, call_id: "call-77", call_status: "CALLING", request_id: 9001, will_ask: [{ field: "PatientDOB", asked_as: "your date of birth" }] })
      );
      fakeHttp.on("GET", outreachUrl(9001), () => json({ request_id: 9001, status: "CALLING", fields: [] }));

      const res = await trigger({ documentId: DOC, by: "spoofed@emids.com" });
      expect(res.body).toMatchObject({
        ok: true,
        trigger_status: "accepted",
        call_status: "CALLING",
        request_id: 9001,
        skipReason: null,
        patched: true,
        uiStatus: "Routed to IVR",
      });

      const [sent] = fakeHttp.to(TRIGGER);
      expect(sent.headers.authorization).toBe("Bearer fake-ivr-key");
      expect(sent.body).toMatchObject({ id: "gaps", documentId: DOC, gaps: { PatientDOB: { status: "open", askable_by: "patient" } } });

      expect(docs().get("gaps", DOC)).toMatchObject({
        trigger_status: "accepted",
        call_id: "call-77",
        call_status: "CALLING",
        request_id: 9001,
        gapStatus: "in_progress",
        will_ask: [{ field: "PatientDOB", asked_as: "your date of birth" }],
      });
      expect(docs().get("review", DOC)).toMatchObject({
        status: "routed_to_ivr",
        reviewed_by: EMAIL[STAFF],
        note: "Routed to IVR (call_status: CALLING, request: 9001)",
      });
      expect(fakeHttp.to(outreachUrl(9001))).toHaveLength(1);
    });

    it("the patch is conditional on the gaps item's ETag", async () => {
      fakeHttp.on("POST", TRIGGER, () => json({ accepted: true, call_status: "CALLING", request_id: 1 }));
      fakeHttp.on("GET", outreachUrl(1), () => json({ status: "CALLING" }));
      const etag = docs().get("gaps", DOC)!._etag;
      await trigger({ documentId: DOC });
      expect(docs().calls.find((c) => c.op === "patch")).toMatchObject({ id: "gaps", partitionKey: DOC, ifMatch: etag });
    });

    it("a call that completes at once settles the document instead of routing it", async () => {
      fakeHttp.on("POST", TRIGGER, () => json({ accepted: true, call_status: "COMPLETED", request_id: 5 }));
      fakeHttp.on("GET", outreachUrl(5), () =>
        json({ status: "COMPLETED", fields: [{ field: "PatientDOB", value: "1950-01-01", status: "COMPLETED" }] })
      );
      const res = await trigger({ documentId: DOC });
      expect(res.body).toMatchObject({ trigger_status: "accepted", uiStatus: "Processed", skipReason: null, patched: true });
      expect(docs().get("review", DOC)).toMatchObject({ status: "approved", reviewed_by: "IVR Outreach" });
      expect(docs().get("gaps", DOC)).toMatchObject({ gapStatus: "resolved", openCount: 0 });
    });

    it("builds the payload from the extract when there is no gaps item, and patches nothing", async () => {
      const id = "ui/no-gaps-item";
      docs().seed(ocr(id), extract(id), fields(id, { PatientPhone: { value: "", class: "A" } }));
      fakeHttp.on("POST", TRIGGER, () => json({ accepted: true, call_status: "CALLING" }));
      const res = await trigger({ documentId: id });
      expect(res.body).toMatchObject({ trigger_status: "accepted", patched: false });
      expect(fakeHttp.to(TRIGGER)[0].body).toEqual({
        id: "gaps",
        itemType: "gaps",
        documentId: id,
        runId: "ui",
        docId: "no-gaps-item",
        docType: "referralForm",
        callDirection: "outbound",
        gapStatus: "open",
        gapCount: 2,
        openCount: 2,
        contact: { patient_name: "Test Patient", patient_phone: null, patient_dob: null },
        gaps: {
          PatientDOB: { status: "open", askable_by: "patient", description: "PatientDOB is blank on the extracted document." },
          PatientPhone: { status: "open", askable_by: "patient", description: "PatientPhone is blank on the extracted document." },
        },
      });
      expect(docs().get("gaps", id)).toBeUndefined();
    });

    it.each([
      ["a 409 'already in progress'", 409, { detail: "Outreach already in progress for request 314 call abc" }, { trigger_status: "accepted", call_status: "CALLING", request_id: "314", call_id: "abc", trigger_http_status: 409 }],
      ["a 409 'already completed'", 409, { detail: "already completed: outreach/88" }, { trigger_status: "accepted", call_status: "COMPLETED", request_id: "88" }],
      ["a 400 with another detail", 400, { detail: "invalid phone" }, { trigger_status: "rejected", trigger_http_status: 400, trigger_error: '{"detail":"invalid phone"}' }],
      ["a 200 with accepted: false", 200, { accepted: false, reason: "no consent" }, { trigger_status: "rejected", trigger_error: '{"accepted":false,"reason":"no consent"}' }],
    ])("maps %s", async (_label, status, body, expected) => {
      fakeHttp.on("POST", TRIGGER, () => json(body, status));
      fakeHttp.on("GET", (url) => url.pathname.startsWith("/idp/outreach/"), () => json({ status: "CALLING" }));
      const res = await trigger({ documentId: DOC });
      expect(res.body).toMatchObject({ ok: true, ...expected });
    });

    it("a non-JSON 200 is 'failed'", async () => {
      fakeHttp.on("POST", TRIGGER, () => new Response("<html>ngrok</html>", { status: 200 }));
      expect((await trigger({ documentId: DOC })).body).toMatchObject({ trigger_status: "failed", trigger_error: "response was not JSON", skipReason: null });
    });

    it("an unreachable IVR backend is 'failed', and the review is not routed", async () => {
      // No handler: the fake fetch fails like a dead network.
      const res = await trigger({ documentId: DOC });
      fakeHttp.unmatched.length = 0;
      expect(res.body).toMatchObject({ trigger_status: "failed", skipReason: null, uiStatus: "Routed to IVR" });
      expect((res.body as any).trigger_error).toMatch(/^TypeError: fetch failed/);
      expect(docs().get("review", DOC)).toBeUndefined();
    });
  });
});

describe("GET /ivr-outreach", () => {
  const outreach = (params: Record<string, string>) => handleSenderra("GET", "/ivr-outreach", new URLSearchParams(params), {}, as(STAFF));

  it("needs a requestId, or a documentId whose gaps item has one", async () => {
    expect((await outreach({})).status).toBe(400);
    expect((await outreach({ documentId: DOC })).body).toEqual({ ok: false, error: "Provide requestId or documentId." });
  });

  it("is 404 while outreach is disabled", async () => {
    expect(await outreach({ requestId: "4242" })).toEqual({ status: 404, body: { ok: false, error: "Could not retrieve outreach for request 4242." } });
  });

  it("returns the IVR backend's record, by request id or by document", async () => {
    configureEnv(WITH_IVR);
    const record = { request_id: 4242, status: "PARTIAL", fields: [{ field: "PatientDOB", status: "PENDING" }] };
    fakeHttp.on("GET", outreachUrl(4242), () => json(record));
    expect(await outreach({ requestId: "4242" })).toEqual({ status: 200, body: { ok: true, outreach: record } });
    expect(await outreach({ documentId: CORPUS.routedToIvr })).toEqual({ status: 200, body: { ok: true, outreach: record } });
  });

  it("builds /idp/outreach/<id> from a trigger URL without 'trigger-outreach'", async () => {
    configureEnv({ ...WITH_IVR, IVR_TRIGGER_URL: "https://ivr.test/some/other/path" });
    fakeHttp.on("GET", "https://ivr.test/idp/outreach/7", () => json({ status: "CALLING" }));
    expect((await outreach({ requestId: "7" })).status).toBe(200);
  });
});

describe("POST /ivr-writeback", () => {
  it("fails closed (503) when IVR_WRITEBACK_API_KEY is unset", async () => {
    const res = await writeback({ documentId: DOC, fields: {} });
    expect(res.status).toBe(503);
  });

  it("with the key set, needs a matching x-api-key", async () => {
    configureEnv({ IVR_WRITEBACK_API_KEY: "wb-key" });
    expect(await writeback({ documentId: DOC })).toEqual({ status: 401, body: { ok: false, error: "Missing or wrong x-api-key." } });
    expect((await writeback({ documentId: DOC }, { "x-api-key": "wb-kez" })).status).toBe(401);
    expect((await writeback({ documentId: DOC }, { "X-Api-Key": "wb-key" })).status).toBe(200);
    expect(docs().get("review", DOC)).toMatchObject({ status: "approved" });
  });

  it("a session cookie is not a substitute for the key", async () => {
    configureEnv({ IVR_WRITEBACK_API_KEY: "wb-key" });
    const res = await handleSenderra("POST", "/ivr-writeback", new URLSearchParams(), { documentId: DOC }, as(STAFF));
    expect(res.status).toBe(401);
  });

  it("needs a documentId (or document_id)", async () => {
    configureEnv({ IVR_WRITEBACK_API_KEY: "wb-key" });
    expect((await writeback({}, { "x-api-key": "wb-key" })).status).toBe(400);
    expect((await writeback({ document_id: ` ${DOC} ` }, { "x-api-key": "wb-key" })).body).toMatchObject({ ok: true, documentId: DOC });
  });

  it("accepts fields as a list, approves as 'IVR Outreach' and mirrors the values (snapshot)", async () => {
    configureEnv({ IVR_WRITEBACK_API_KEY: "wb-key" });
    const res = await writeback({
      documentId: DOC,
      request_id: 31,
      fields: [
        { field: "PatientDOB", value: "1999-09-09" },
        { field: "MemberID", value: null },
        { field: "Ignored" },
        "not-an-object",
      ],
    }, { "x-api-key": "wb-key" });
    expect(res).toEqual({ status: 200, body: { ok: true, documentId: DOC, uiStatus: "Processed", settledCount: 1 } });
    expect(docs().get("review", DOC)).toMatchObject({
      status: "approved",
      reviewed_by: "IVR Outreach",
      note: "Settled via IVR writeback (request #31)",
      corrections: { PatientDOB: { value: "1999-09-09", by: "IVR Outreach" } },
    });
    expect(Object.keys(docs().get("review", DOC)!.corrections)).toEqual(["PatientDOB"]);
    expect(docs().get("fields", DOC)!.fields.PatientDOB).toMatchObject({ value: "1999-09-09", needs_review: false });
    expect(docs().get("gaps", DOC)).toMatchObject({ gapStatus: "resolved", openCount: 0, gaps: { PatientDOB: { status: "settled" } } });
  });

  it("accepts fields as a map of values or {value} objects, on /ivr-webhook too", async () => {
    configureEnv({ IVR_WRITEBACK_API_KEY: "wb-key" });
    const res = await writeback({ documentId: DOC, requestId: 32, fields: { PatientDOB: { value: "2000-01-01" }, MemberID: "M-1", Blank: null } }, { "x-api-key": "wb-key" }, "/ivr-webhook");
    expect(res.body).toMatchObject({ settledCount: 2 });
    expect(docs().get("review", DOC)!.corrections).toMatchObject({ PatientDOB: { value: "2000-01-01", by: "IVR Outreach" }, MemberID: { value: "M-1" } });
    expect(docs().get("review", DOC)!.note).toBe("Settled via IVR writeback (request #32)");
  });

  it("approves even with no fields", async () => {
    configureEnv({ IVR_WRITEBACK_API_KEY: "wb-key" });
    expect((await writeback({ documentId: DOC }, { "x-api-key": "wb-key" })).body).toMatchObject({ settledCount: 0 });
    expect(docs().get("review", DOC)).toMatchObject({ status: "approved", note: "Settled via IVR writeback" });
  });
});
