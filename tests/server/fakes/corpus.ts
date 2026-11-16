/**
 * Synthetic Cosmos items in the shape the pipeline writes them. No real
 * documents or PHI: every name, id and value here is made up.
 *
 * `corpus()` returns one document per UI status the server can derive, plus a
 * duplicate pair and an IVR-routed document, so a single seeded container
 * exercises every branch of the list and stats folding.
 */

type Item = Record<string, any>;

function ids(documentId: string) {
  const cut = documentId.indexOf("/");
  return { documentId, runId: documentId.slice(0, cut), docId: documentId.slice(cut + 1) };
}

export function ocr(documentId: string, extra: Item = {}): Item {
  return {
    id: "ocr",
    itemType: "ocr",
    ...ids(documentId),
    status: "Succeeded",
    blob_path: `docs-in/${documentId}.pdf`,
    file_bytes: 20_000 + documentId.length,
    page_count: 2,
    mean_page_confidence: 0.97,
    min_page_confidence: 0.93,
    cu_latency_ms: 4_000,
    queue_wait_ms: 120,
    cost_cu_usd: 0.01,
    e2e_latency_ms: 5_000,
    recorded_at: "2026-10-01T09:00:00Z",
    source: "upload",
    ...extra,
  };
}

export function extract(documentId: string, extra: Item = {}): Item {
  return {
    id: "extract",
    itemType: "extract",
    ...ids(documentId),
    status: "Succeeded",
    doc_type_predicted: "referralForm",
    classify_confidence: 0.98,
    page_count: 2,
    field_count: 3,
    field_score_mean: 0.91,
    ocr_conf_mean: 0.96,
    fields_needing_review: 0,
    needs_review: false,
    review_reasons: [],
    review_fields: [],
    prompt_tokens: 3_000,
    cached_tokens: 1_500,
    completion_tokens: 400,
    cache_hit_frac: 0.5,
    cost_llm_usd: 0.004,
    total_cost_usd: 0.014,
    pages_billed: 2,
    model_deployment: "gpt-5.4-mini",
    model_id: "gpt-5.4-mini",
    model_source: "active",
    e2e_latency_ms: 9_000,
    recorded_at: "2026-10-01T09:00:30Z",
    source: "upload",
    ...extra,
  };
}

export function fields(documentId: string, values: Record<string, Item> = {}): Item {
  return {
    id: "fields",
    itemType: "fields",
    ...ids(documentId),
    docType: "referralForm",
    fields: {
      PatientName: { value: "Test Patient", quote: "Test Patient", class: "A", needs_review: false },
      PatientDOB: { value: null, class: "A", needs_review: true, review_reasons: ["null_required"] },
      ProviderNPI: { value: "0000000000", quote: "0000000000", class: "A", needs_review: false },
      ...values,
    },
  };
}

export function review(documentId: string, extra: Item = {}): Item {
  return {
    id: "review",
    itemType: "review",
    ...ids(documentId),
    status: "pending",
    corrections: {},
    audit: [],
    claimed_by: null,
    claimed_at: null,
    reviewed_by: null,
    reviewed_at: null,
    note: null,
    ...extra,
  };
}

export function gaps(documentId: string, extra: Item = {}): Item {
  return {
    id: "gaps",
    itemType: "gaps",
    ...ids(documentId),
    docType: "referralForm",
    callDirection: "outbound",
    gapStatus: "open",
    gapCount: 1,
    openCount: 1,
    contact: { patient_phone: "+15550000000" },
    gaps: {
      PatientDOB: { status: "open", askable_by: "patient", description: "Date of birth" },
    },
    ...extra,
  };
}

const needsReview = { needs_review: true, fields_needing_review: 1, review_reasons: ["low_field_score"], review_fields: ["PatientDOB"] };

/** One document per derived UI status. Keys are the expected status, for readable tests. */
export const CORPUS = {
  processed: "ui/processed-1",
  needsReview: "ui/needs-review-1",
  inHilReview: "ui/claimed-1",
  approved: "ui/approved-1",
  rejected: "ui/rejected-1",
  processing: "ui/ocr-only-1",
  ocrFailed: "ui/ocr-failed-1",
  triage: "ui/triage-1",
  routedToIvr: "prod/ivr-routed-1",
  gapsResolved: "prod/gaps-resolved-1",
  duplicateOriginal: "ui/dup-case",
  duplicateCopy: "ui/dup-case-2",
} as const;

export function corpus(): Item[] {
  const at = (minute: number) => `2026-10-01T09:${String(minute).padStart(2, "0")}:00Z`;
  const c = CORPUS;
  return [
    ocr(c.processed, { recorded_at: at(1) }),
    extract(c.processed, { recorded_at: at(1) }),

    ocr(c.needsReview, { recorded_at: at(2) }),
    extract(c.needsReview, { ...needsReview, recorded_at: at(2) }),
    fields(c.needsReview),

    ocr(c.inHilReview, { recorded_at: at(3) }),
    extract(c.inHilReview, { ...needsReview, doc_type_predicted: "priorAuthRequest", recorded_at: at(3) }),
    review(c.inHilReview, { status: "claimed", claimed_by: "pacca.staff@emids.com", claimed_at: at(4) }),

    ocr(c.approved, { recorded_at: at(5) }),
    extract(c.approved, { ...needsReview, recorded_at: at(5) }),
    review(c.approved, {
      status: "approved",
      reviewed_by: "pacca.staff@emids.com",
      reviewed_at: at(6),
      corrections: { PatientDOB: { value: "1980-01-01", by: "pacca.staff@emids.com", at: at(6) } },
    }),

    ocr(c.rejected, { recorded_at: at(7) }),
    extract(c.rejected, { ...needsReview, recorded_at: at(7) }),
    review(c.rejected, { status: "rejected", reviewed_by: "pacca.staff@emids.com", reviewed_at: at(8), note: "illegible" }),

    ocr(c.processing, { recorded_at: at(9) }),

    ocr(c.ocrFailed, { status: "Failed", recorded_at: at(10) }),

    ocr(c.triage, { recorded_at: at(11) }),
    extract(c.triage, { status: "ClassifiedOther", doc_type_predicted: "other", recorded_at: at(11) }),

    ocr(c.routedToIvr, { recorded_at: at(12) }),
    extract(c.routedToIvr, { ...needsReview, recorded_at: at(12) }),
    review(c.routedToIvr, { status: "routed_to_ivr", reviewed_by: "IVR Outreach", note: "Routed to IVR (call_status: calling, request: 4242)" }),
    gaps(c.routedToIvr, { gapStatus: "in_progress", request_id: 4242, trigger_status: "accepted" }),

    ocr(c.gapsResolved, { recorded_at: at(13) }),
    extract(c.gapsResolved, { ...needsReview, recorded_at: at(13) }),
    gaps(c.gapsResolved, { gapStatus: "resolved", openCount: 0 }),

    ocr(c.duplicateOriginal, { file_bytes: 55_555, recorded_at: at(14) }),
    extract(c.duplicateOriginal, { recorded_at: at(14) }),
    ocr(c.duplicateCopy, { file_bytes: 55_555, recorded_at: at(15) }),
    extract(c.duplicateCopy, { recorded_at: at(15) }),
  ];
}
