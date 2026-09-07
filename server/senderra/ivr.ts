/**
 * Fire-and-forget IVR outreach.
 *
 * POST the Cosmos `gaps` item as-is when it exists. OpenAPI
 * `/idp/trigger-outreach` takes that JSON object (extra keys ignored) and
 * authenticates with the `authorization` header. Never raises. A failed
 * trigger leaves gapStatus open; extraction remains Succeeded.
 *
 * PACCA button rules differ from Azure Function App eligibility: blank
 * required / class-A fields are why outreach runs, including empty phone.
 */

import type { ExtractItem, ExtractedField, FieldsItem } from "./types.js";

export const SKIP_DISABLED = "disabled";
export const SKIP_NOT_OUTBOUND = "skipped_not_outbound";
export const SKIP_NO_GAPS = "skipped_no_gaps";
export const SKIP_NO_CONTACT = "skipped_no_contact";
export const SKIP_NO_PATIENT_GAPS = "skipped_no_patient_gaps";
export const ACCEPTED = "accepted";
export const REJECTED = "rejected";
export const FAILED = "failed";

/** Patient-askable field names from analyzers/out/gap_routing.json `askable_by`. */
const PATIENT_ASKABLE = new Set([
  "PatientName",
  "PatientDOB",
  "PatientGender",
  "PatientAddress",
  "PatientPhone",
  "PatientEmail",
  "PreferredLanguage",
  "PatientAllergies",
  "PatientWeight",
  "PatientHeight",
  "MemberID",
  "GroupNumber",
  "RxBIN",
  "RxPCN",
  "RxGroup",
  "PayerName",
  "PayerID",
  "PlanName",
  "PlanType",
  "SubscriberName",
  "EffectiveDate",
  "CopayInformation",
  "MemberServicesPhone",
  "PharmacyHelpDeskPhone",
  "SecondaryPayerName",
  "ShipToLocation",
  "InsuranceCardAttached",
  "PatientConsentSignature",
]);

export type IvrConfig = {
  enabled: boolean;
  url: string;
  apiKey: string;
  timeoutSec: number;
};

export type GapField = {
  status?: string;
  askable_by?: string;
  description?: string;
  [key: string]: unknown;
};

export type GapsItem = {
  id?: string;
  itemType?: string;
  documentId?: string;
  runId?: string;
  docId?: string;
  docType?: string | null;
  callDirection?: string | null;
  gapStatus?: string | null;
  gapCount?: number;
  openCount?: number;
  contact?: Record<string, unknown> | null;
  gaps?: Record<string, GapField> | null;
  _etag?: string;
  [key: string]: unknown;
};

export type IvrOutcome = {
  trigger_status: string;
  triggered_at: string;
  trigger_error?: string;
  trigger_http_status?: number;
  call_id?: unknown;
  call_status?: unknown;
  request_id?: unknown;
  will_ask?: unknown;
  skipped?: unknown;
  test_mode?: unknown;
};

export type OutreachHint = {
  visible: boolean;
  enabled: boolean;
  skipReason: string | null;
  openCount: number;
  patientAskableOpen: number;
  blankRequiredCount: number;
  gapStatus: string | null;
  callDirection: string | null;
  hasGapsItem: boolean;
};

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["true", "1", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function readIvrConfig(): IvrConfig {
  const timeoutRaw = Number(process.env.IVR_TRIGGER_TIMEOUT || 10);
  return {
    // PACCA UI/server only. Azure Function App uses IVR_TRIGGER_ENABLED independently.
    enabled: envFlag("PACCA_IVR_TRIGGER_ENABLED", false),
    url: process.env.IVR_TRIGGER_URL?.trim() || "",
    apiKey: process.env.IVR_API_KEY?.trim() || "",
    timeoutSec: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10,
  };
}

export function ivrHealthPublic(config = readIvrConfig()): { ivrTriggerEnabled: boolean; ivrUrlSet: boolean } {
  return {
    ivrTriggerEnabled: config.enabled && Boolean(config.url),
    ivrUrlSet: Boolean(config.url),
  };
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Blank for outreach: null, empty, UI em dash, all-null address objects. */
export function isBlankValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" || t === "—" || t === "–" || t === "-";
  }
  if (Array.isArray(value)) return value.length === 0 || value.every(isBlankValue);
  if (typeof value === "object") {
    const vals = Object.values(value as Record<string, unknown>);
    return vals.length === 0 || vals.every(isBlankValue);
  }
  return false;
}

export function patientAskableOpen(item: GapsItem | null | undefined): number {
  const gaps = item?.gaps;
  if (!gaps || typeof gaps !== "object") return 0;
  return Object.values(gaps).filter(
    (g) =>
      g &&
      g.status === "open" &&
      g.askable_by === "patient" &&
      String(g.description || "").trim()
  ).length;
}

function scalarContact(value: unknown): string | null {
  if (isBlankValue(value)) return null;
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return null;
}

export function blankRequiredCount(fields: Record<string, { value?: unknown; class?: string }> | null | undefined): number {
  if (!fields) return 0;
  let n = 0;
  for (const field of Object.values(fields)) {
    if (field?.class === "A" && isBlankValue(field.value)) n += 1;
  }
  return n;
}

/**
 * OpenAPI body is the Cosmos gaps item. When that item is missing, build the
 * same shape from extract/fields so the click still POSTs.
 */
export function gapsPayloadFromExtract(
  documentId: string,
  extract: ExtractItem | null | undefined,
  fields: FieldsItem | null | undefined
): GapsItem | null {
  if (!extract && !fields) return null;
  const fieldMap = fields?.fields ?? {};
  const gaps: Record<string, GapField> = {};
  for (const [name, field] of Object.entries(fieldMap) as [string, ExtractedField][]) {
    if (field?.class !== "A" || !isBlankValue(field.value)) continue;
    gaps[name] = {
      status: "open",
      askable_by: PATIENT_ASKABLE.has(name) ? "patient" : "prescriber",
      description: `${name} is blank on the extracted document.`,
    };
  }
  const slash = documentId.indexOf("/");
  const runId =
    extract?.runId ?? fields?.runId ?? (slash < 0 ? documentId : documentId.slice(0, slash));
  const docId =
    extract?.docId ?? fields?.docId ?? (slash < 0 ? documentId : documentId.slice(slash + 1));
  const openCount = Object.keys(gaps).length;
  return {
    id: "gaps",
    itemType: "gaps",
    documentId,
    runId,
    docId,
    docType: extract?.doc_type_predicted ?? fields?.docType ?? null,
    callDirection: "outbound",
    gapStatus: "open",
    gapCount: openCount,
    openCount,
    contact: {
      patient_name: scalarContact(fieldMap.PatientName?.value),
      patient_phone: scalarContact(fieldMap.PatientPhone?.value),
      patient_dob: scalarContact(fieldMap.PatientDOB?.value),
    },
    gaps,
  };
}

/** Azure Function App gates — kept for tests/compat; PACCA UI does not use these to disable the button. */
export function eligibility(item: GapsItem, config = readIvrConfig()): [boolean, string | null] {
  if (!config.enabled || !config.url) return [false, SKIP_DISABLED];

  if (item.callDirection !== "outbound") return [false, SKIP_NOT_OUTBOUND];

  const gaps = item.gaps;
  const hasGaps = Boolean(gaps && typeof gaps === "object" && Object.keys(gaps).length > 0);
  if (!hasGaps || !item.openCount) return [false, SKIP_NO_GAPS];

  const contact = item.contact || {};
  const blankElsewhere = Object.values(item.gaps || {}).some(
    (g) => g && g.status === "open" && g.askable_by === "patient"
  );
  if (!contact.patient_name) return [false, SKIP_NO_CONTACT];
  if (!contact.patient_phone && !blankElsewhere) return [false, SKIP_NO_CONTACT];

  if (patientAskableOpen(item) === 0) return [false, SKIP_NO_PATIENT_GAPS];

  return [true, null];
}

/**
 * Show Trigger outreach when extract exists, type is not `other`, and there is
 * something a patient call could fill: blank class-A/required fields or open
 * patient-askable gaps. Empty DOB / address / phone enable the button.
 */
export function outreachHint(
  docType: string | null | undefined,
  fields: Record<string, { value?: unknown; class?: string }> | null | undefined,
  gaps: GapsItem | null | undefined,
  hasExtract = false,
  config = readIvrConfig()
): OutreachHint {
  const type = (docType || "").toLowerCase();
  const blank = blankRequiredCount(fields);
  const askable = patientAskableOpen(gaps);
  const openCount = typeof gaps?.openCount === "number" ? gaps.openCount : 0;
  const hasGapsItem = Boolean(gaps);
  const configured = config.enabled && Boolean(config.url);
  const somethingToAsk = askable > 0 || blank > 0;
  const visible = hasExtract && type !== "other" && somethingToAsk;
  const enabled = visible && configured;

  let skipReason: string | null = null;
  if (visible && !configured) skipReason = SKIP_DISABLED;

  return {
    visible,
    enabled,
    skipReason,
    openCount,
    patientAskableOpen: askable,
    blankRequiredCount: blank,
    gapStatus: gaps?.gapStatus ?? null,
    callDirection: gaps?.callDirection ?? null,
    hasGapsItem,
  };
}

export async function trigger(item: GapsItem, config = readIvrConfig()): Promise<IvrOutcome> {
  if (!config.enabled || !config.url) {
    return { trigger_status: SKIP_DISABLED, triggered_at: nowIso() };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "senderra-idp/1.0",
  };
  // OpenAPI names this header `authorization` (optional). Bearer matches IDP.
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const t0 = nowIso();
  let resp: Response;
  try {
    resp = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(item),
      signal: AbortSignal.timeout(Math.round(config.timeoutSec * 1000)),
    });
  } catch (exc) {
    const name = exc instanceof Error ? exc.constructor.name : "Error";
    const message = exc instanceof Error ? exc.message : String(exc);
    return {
      trigger_status: FAILED,
      triggered_at: t0,
      trigger_error: `${name}: ${message}`.slice(0, 500),
    };
  }

  const text = await resp.text();
  if (resp.status >= 300) {
    let bodyJson: Record<string, unknown> | null = null;
    try {
      bodyJson = JSON.parse(text) as Record<string, unknown>;
    } catch {}

    const detail = typeof bodyJson?.detail === "string" ? bodyJson.detail : text;
    if (detail.toLowerCase().includes("already calling") || detail.toLowerCase().includes("already in progress")) {
      const reqMatch = detail.match(/request\s+(\w+)/i);
      const callMatch = detail.match(/call\s+(\w+)/i);
      return {
        trigger_status: ACCEPTED,
        triggered_at: t0,
        trigger_http_status: resp.status,
        call_status: "CALLING",
        request_id: reqMatch ? reqMatch[1] : undefined,
        call_id: callMatch ? callMatch[1] : undefined,
      };
    }

    return {
      trigger_status: REJECTED,
      triggered_at: t0,
      trigger_http_status: resp.status,
      trigger_error: text.slice(0, 500),
    };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      trigger_status: FAILED,
      triggered_at: t0,
      trigger_http_status: resp.status,
      trigger_error: "response was not JSON",
    };
  }

  if (!body.accepted) {
    return {
      trigger_status: REJECTED,
      triggered_at: t0,
      trigger_http_status: resp.status,
      trigger_error: JSON.stringify(body).slice(0, 500),
    };
  }

  const out: IvrOutcome = {
    trigger_status: ACCEPTED,
    triggered_at: t0,
    trigger_http_status: resp.status,
    call_id: body.call_id,
    call_status: body.call_status,
    request_id: body.request_id,
  };
  if (body.will_ask !== undefined) out.will_ask = body.will_ask;
  if (body.skipped !== undefined) out.skipped = body.skipped;
  if (body.test_mode !== undefined) out.test_mode = body.test_mode;
  return out;
}

export function patchOps(outcome: IvrOutcome): { op: "set"; path: string; value: unknown }[] {
  const ops = Object.entries(outcome)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({ op: "set" as const, path: `/${k}`, value: v }));
  if (outcome.trigger_status === ACCEPTED) {
    ops.push({ op: "set", path: "/gapStatus", value: "in_progress" });
  }
  return ops;
}
