/**
 * The shapes the Senderra pipeline actually writes into Cosmos.
 *
 * Partition key is `/documentId`, carrying `<runId>/<docId>` — so all items for
 * one document share a logical partition and come back in a single-partition
 * read. `id` is unique only within that partition, which is why these four
 * constants work as ids.
 */

export type ItemType = "ocr" | "extract" | "fields" | "review";

/** Written by fn_ocr. Legibility signals live here, not on the extract record. */
export type OcrItem = {
  id: "ocr";
  itemType: "ocr";
  documentId: string;
  runId: string;
  docId: string;
  status?: string;
  blob_path?: string;
  file_bytes?: number;
  page_count?: number;
  word_count?: number;
  words_present?: boolean;
  markdown_chars?: number;
  mean_page_confidence?: number;
  min_page_confidence?: number;
  below_page_confidence_floor?: boolean;
  analyzer_id?: string;
  cu_latency_ms?: number;
  queue_wait_ms?: number;
  cost_cu_usd?: number;
  work_prefix?: string;
  e2e_latency_ms?: number;
  recorded_at?: string;
  source?: string;
};

/** Written by fn_extract. This is what every dashboard aggregate reads. */
export type ExtractItem = {
  id: "extract";
  itemType: "extract";
  documentId: string;
  runId: string;
  docId: string;
  status?: string;
  doc_type_predicted?: string;
  classify_confidence?: number;
  classify_score?: number;
  classify_evidence_grounded?: boolean;
  page_count?: number;
  field_count?: number;
  field_populated?: number;
  field_null?: number;
  grounded_frac?: number;
  quote_not_found?: number;
  model_conf_mean?: number;
  ocr_conf_mean?: number;
  field_score_mean?: number;
  field_score_min?: number;
  fields_needing_review?: number;
  needs_review?: boolean;
  review_reasons?: string[];
  review_fields?: string[];
  prompt_tokens?: number;
  cached_tokens?: number;
  completion_tokens?: number;
  cache_hit_frac?: number;
  cost_llm_usd?: number;
  cost_cu_usd?: number;
  total_cost_usd?: number;
  pages_billed?: number;
  model_deployment?: string;
  extract_ms?: number;
  classify_ms?: number;
  e2e_latency_ms?: number;
  results_blob?: string;
  recorded_at?: string;
  source?: string;
};

export type FieldGrounding = {
  grounded?: boolean;
  match?: string;
  page?: number;
  offset?: number;
  length?: number;
  polygon?: string;
  ocr_confidence?: number;
  ocr_min_confidence?: number;
  quote_in_document?: boolean;
};

export type FieldScores = {
  model_confidence?: number | null;
  grounding_score?: number | null;
  ocr_score?: number | null;
  validation_score?: number | null;
  field_score?: number | null;
  weakest_signal?: string | null;
};

export type ExtractedField = {
  value: string | number | boolean | null;
  quote?: string | null;
  class?: string;
  grounding?: FieldGrounding;
  scores?: FieldScores;
  needs_review?: boolean;
  review_reasons?: string[];
};

/** Written by fn_extract. The reviewer's item — never touched by aggregates. */
export type FieldsItem = {
  id: "fields";
  itemType: "fields";
  documentId: string;
  runId: string;
  docId: string;
  docType?: string;
  promptSha?: string;
  modelDeployment?: string;
  classification?: Record<string, unknown>;
  review?: { needs_review?: boolean; review_reasons?: string[]; review_fields?: string[] };
  fields?: Record<string, ExtractedField>;
};

export type ReviewAudit = {
  at: string;
  by: string;
  action: "claimed" | "released" | "corrected" | "approved" | "rejected";
  field?: string;
  old_value?: unknown;
  new_value?: unknown;
  note?: string | null;
};

/**
 * HIL state. NOT written by the pipeline — `shared/cosmos.py` has no notion of
 * it. Three of these already exist in the container, written by something
 * outside the senderra-idp-sol repo, so this shape mirrors what is stored
 * rather than inventing a new one. Corrections are keyed by field name;
 * `audit` is append-only.
 */
export type ReviewItem = {
  id: "review";
  itemType: "review";
  documentId: string;
  runId: string;
  docId: string;
  status?: "pending" | "claimed" | "approved" | "rejected";
  corrections?: Record<string, { value: unknown; by: string; at: string }>;
  audit?: ReviewAudit[];
  claimed_by?: string | null;
  claimed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  note?: string | null;
  updatedAt?: string;
};

/** What the Documents table renders, after joining ocr + extract + review. */
export type DocumentSummary = {
  documentId: string;
  runId: string;
  docId: string;
  file: string;
  docType: string | null;
  pipelineStatus: string;
  uiStatus: "Processed" | "Needs Review" | "In HIL Review" | "Processing" | "Queued" | "Triage" | "Failed";
  confidence: number | null;
  classifyConfidence: number | null;
  pages: number | null;
  fileBytes: number | null;
  needsReview: boolean;
  reviewReasons: string[];
  reviewFields: string[];
  fieldCount: number | null;
  fieldsNeedingReview: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  minPageConfidence: number | null;
  receivedAt: string | null;
  source: string | null;
  reviewStatus: string | null;
  reviewedBy: string | null;
  claimedBy: string | null;
  correctionCount: number;
};
