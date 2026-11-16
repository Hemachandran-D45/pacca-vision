/**
 * Characterization: analytics, observability, KQL, the copilot and schemas,
 * as they behave today.
 *
 *   GET  /analytics                       Analytics & Cost aggregates
 *   GET  /observability                   Function App proxy, else Cosmos
 *   GET  /observability-gaps (+ /gaps)    blob vs Cosmos reconciliation
 *   POST /kql                             the in-memory KQL engine
 *   POST /observability-diagnose (+ /diagnose)
 *   POST /observability-chat (+ /chat)    the SRE copilot (OpenAI + tools)
 *   GET  /schema, POST /schemas/sync      blob-first schema store
 *
 * OpenAI, the Function App and Log Analytics are fakes; nothing leaves the
 * process. See routes-documents.test.ts for the conventions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@azure/cosmos", async () => (await import("./fakes/cosmos.js")).fakeCosmosModule());
vi.mock("@azure/storage-blob", async (orig) => ({
  ...(await orig<object>()),
  ...(await import("./fakes/blob.js")).fakeBlobModule(),
}));
// Log Analytics is the Azure Monitor SDK behind DefaultAzureCredential; the
// copilot's `query_azure_monitor` tool is the only caller.
const monitorQueries: string[] = [];
vi.mock("../../server/senderra/logAnalyticsEngine.js", () => ({
  queryLogAnalytics: async (kql: string) => {
    monitorQueries.push(kql);
    throw new Error("LOG_ANALYTICS_WORKSPACE_ID is not configured in environment variables.");
  },
}));

const { handleSenderra } = await import("../../server/senderra/api.js");
const { invalidateSchemaCache } = await import("../../server/senderra/schemaLoader.js");
const { fakeCosmos } = await import("./fakes/cosmos.js");
const { fakeBlobs } = await import("./fakes/blob.js");
const { fakeHttp, json } = await import("./fakes/http.js");
const { DEVELOPER, FUNCTION_URL, WITH_FUNCTION_APP, as, configureEnv } = await import("./fakes/env.js");
const { CORPUS, corpus, extract, ocr } = await import("./fakes/corpus.js");

const NOW = new Date("2026-10-08T12:00:00Z");
const OPENAI = "https://openai.test/v1/chat/completions";
const docs = () => fakeCosmos.container("documents");

const get = (route: string, params: Record<string, string> = {}) =>
  handleSenderra("GET", route, new URLSearchParams(params), {}, as(DEVELOPER));
const post = (route: string, body: Record<string, unknown>) =>
  handleSenderra("POST", route, new URLSearchParams(), body, as(DEVELOPER));

/** Execution times are wall-clock; everything else is deterministic. */
function stableTimes<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, v) => (key === "executionTimeMs" ? 0 : v)).replace(/in [\d.]+ ms/g, "in 0 ms")
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  configureEnv();
  fakeCosmos.reset();
  fakeBlobs.reset();
  fakeHttp.install();
  invalidateSchemaCache();
  monitorQueries.length = 0;
  docs().seed(...corpus());
  // Stage telemetry the observability views read.
  docs().seed(
    ocr("ui/slow-1", { queue_wait_ms: 900, recorded_at: "2026-10-01T09:30:00Z", trace_id: "t-slow" }),
    extract("ui/slow-1", { genai_tool_call_dropout: true, recorded_at: "2026-10-01T09:31:00Z", trace_id: "t-slow" }),
    ocr("ui/errored-1", { status: "Succeeded", recorded_at: "2026-10-01T09:32:00Z" }),
    extract("ui/errored-1", { status: "Failed", error_message: "model timeout", recorded_at: "2026-10-01T09:33:00Z" })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  expect(fakeHttp.unmatched, "unexpected outbound request").toEqual([]);
});

describe("GET /analytics", () => {
  // 12 extract items (10 Succeeded) and 14 ocr items are seeded.
  it("totals spend, tokens, quality and review reasons from the stage records", async () => {
    const res = await get("/analytics");
    expect(res.status).toBe(200);
    const { analytics } = res.body as any;
    expect(analytics.totals).toMatchObject({ documents: 12, succeeded: 10 });
    expect(analytics.totals.spendUsd).toBeCloseTo(12 * 0.014);
    expect(analytics.totals.cuUsd).toBeCloseTo(14 * 0.01);
    expect(analytics.totals.llmUsd).toBeCloseTo(12 * 0.004);
    expect(analytics.totals.costPerDoc).toBeCloseTo(0.014);
    expect(analytics.tokens).toMatchObject({ prompt: 36_000, cached: 18_000, completion: 4_800, cacheHitFrac: 0.5 });
    // STP = succeeded without needs_review: processed, the duplicate pair, slow-1.
    expect(analytics.quality).toMatchObject({ stpCount: 4, fieldsNeedingReview: 6, fieldsTotal: 36, minPageConfidence: 0.93 });
    expect(analytics.quality.stpRate).toBeCloseTo(0.4);
    expect(analytics.gates.documentReasons).toEqual([{ reason: "low_field_score", count: 6 }]);
  });

  it("answers 503 when not configured", async () => {
    configureEnv({ COSMOS_KEY: "" });
    expect((await get("/analytics")).status).toBe(503);
  });
});

describe("GET /observability", () => {
  it("without the Function App, computes stage records and failure counts from Cosmos", async () => {
    const res = await get("/observability");
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toMatchObject({
      ok: true,
      live: true,
      // 26 stage items, newest first, capped at the default limit of 50.
      aggregates: { record_count: 26, failure_count: 2, genai_dropout_count: 1, queue_wait_max_ms: 900 },
      dependency_telemetry: {
        content_understanding: { available: true, observed: 14, failures: 1 },
        azure_openai: { available: true, observed: 12, dropouts: 1 },
      },
    });
    expect(body.records[0]).toMatchObject({ run_id: "ui", doc_id: "errored-1", stage: "extract", status: "Failed", error_message: "model timeout" });
    expect(body.records.find((r: any) => r.doc_id === "slow-1" && r.stage === "ocr")).toMatchObject({ queue_wait_ms: 900, trace_id: "t-slow" });
  });

  it("clamps limit to 1..200 (default 50) and filters by runId", async () => {
    const count = async (params: Record<string, string>) => ((await get("/observability", params)).body as any).records.length;
    const all = docs().all().filter((i) => i.itemType === "ocr" || i.itemType === "extract").length;
    expect(await count({})).toBe(Math.min(all, 50));
    expect(await count({ limit: "2" })).toBe(2);
    expect(await count({ limit: "-5" })).toBe(1);
    expect(await count({ limit: "0" })).toBe(Math.min(all, 50));
    expect(((await get("/observability", { runId: "prod" })).body as any).records.every((r: any) => r.run_id === "prod")).toBe(true);
  });

  it("with the Function App, returns its answer and sends the function key in x-functions-key header", async () => {
    configureEnv(WITH_FUNCTION_APP);
    fakeHttp.on("GET", `${FUNCTION_URL}/api/observability`, () => json({ records: [{ doc_id: "from-fa" }] }));
    const res = await get("/observability", { limit: "500", runId: "ui" });
    expect(res).toEqual({ status: 200, body: { ok: true, live: true, records: [{ doc_id: "from-fa" }] } });
    const [req] = fakeHttp.to(`${FUNCTION_URL}/api/observability`);
    expect(Object.fromEntries(req.url.searchParams)).toEqual({ limit: "200", run_id: "ui" });
    expect(req.headers["x-functions-key"]).toBe("fake-fn-key");
  });

  it("falls back to Cosmos when the Function App answers an error (as it does today: no such endpoint on the FA)", async () => {
    configureEnv(WITH_FUNCTION_APP);
    fakeHttp.on("GET", `${FUNCTION_URL}/api/observability`, () => json({ error: "Not Found" }, 404));
    const body = (await get("/observability")).body as any;
    expect(body.live).toBe(true);
    expect(body.records.length).toBeGreaterThan(0);
  });

  it("KNOWN BEHAVIOUR: a Cosmos failure echoes the raw error (TRACKER section 5)", async () => {
    docs().failNext("query", new Error("cosmos down"));
    expect(await get("/observability")).toEqual({
      status: 502,
      body: { ok: false, error: "Cosmos observability query failed: Error: cosmos down" },
    });
  });
});

describe("GET /observability-gaps", () => {
  beforeEach(() => {
    // Uploaded long enough ago to be flagged (anything under 60 s is in flight).
    const old = { createdOn: "2026-10-08T11:00:00Z" };
    fakeBlobs.add("docs-in", "ui/never-seen.pdf", old); // no ocr record: Event Grid gap
    fakeBlobs.add("docs-in", `${CORPUS.ocrFailed}.pdf`, old); // ocr Failed
    fakeBlobs.add("docs-in", `${CORPUS.processing}.pdf`, old); // ocr ok, no extract
    fakeBlobs.add("docs-in", `${CORPUS.processed}.pdf`, old); // complete: no gap
    fakeBlobs.add("docs-in", "ui/just-now.pdf", { createdOn: "2026-10-08T11:59:30Z" }); // in flight: no gap
  });

  it("flags each blob the pipeline lost or stalled on, and nothing else", async () => {
    const res = await get("/observability-gaps");
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toMatchObject({ ok: true, blobCount: 5, cosmosCount: 26, eventGridGaps: 1, ocrStuck: 1, extractMissing: 1, longRunning: 0, estimatedDlqDepth: 2 });
    expect(body.gaps.map((g: any) => [g.documentId, g.category, g.severity, g.stuckForMs])).toEqual([
      ["ui/never-seen", "event_grid_gap", "critical", 3_600_000],
      [CORPUS.ocrFailed, "ocr_stuck", "critical", expect.any(Number)],
      [CORPUS.processing, "extract_missing", "warning", expect.any(Number)],
    ]);
  });

  it("answers the same on /observability/gaps, and filters by runId", async () => {
    expect((await get("/observability/gaps")).body).toEqual((await get("/observability-gaps")).body);
    expect(((await get("/observability-gaps", { runId: "prod" })).body as any).gaps).toEqual([]);
  });
});

describe("POST /kql", () => {
  const kql = async (query: string) => {
    const res = await post("/kql", { query });
    return { status: res.status, body: stableTimes(res.body) as any };
  };

  it("refuses an empty query", async () => {
    expect(await kql("  ")).toEqual({
      status: 400,
      body: { ok: false, query: "", executionTimeMs: 0, totalRows: 0, columns: [], rows: [], error: "Query is empty." },
    });
  });

  const docIds = (rows: any[]) => rows.map((r) => r.doc_id).sort();

  it("take limits the rows; traces are one row per stage item", async () => {
    expect((await kql("traces")).body.totalRows).toBe(26);
    const { body } = await kql("traces | take 3");
    expect(body).toMatchObject({ ok: true, totalRows: 3 });
    expect(body.columns).toEqual(expect.arrayContaining(["timestamp", "stage", "run_id", "doc_id", "status", "queue_wait_ms"]));
  });

  it("where, project, order by and take compose left to right", async () => {
    const { body } = await kql("traces | where stage == 'ocr' | project doc_id, queue_wait_ms | order by queue_wait_ms desc | take 4");
    expect(body.columns).toEqual(["doc_id", "queue_wait_ms"]);
    expect(body.rows).toHaveLength(4);
    expect(body.rows[0]).toEqual({ doc_id: "slow-1", queue_wait_ms: 900 });
  });

  it.each([
    ["traces | where genai_tool_call_dropout == true", ["slow-1"]],
    ["traces | where queue_wait_ms > 500", ["slow-1"]],
    ["traces | where status != 'Succeeded'", ["errored-1", "ocr-failed-1", "triage-1"]],
    ["exceptions", ["errored-1", "ocr-failed-1"]],
  ])("%s", async (query, expected) => {
    expect(docIds((await kql(query)).body.rows)).toEqual(expected);
  });

  it("summarize groups by a column with counts, failures and dropouts", async () => {
    const { body } = await kql("traces | summarize count() by stage");
    expect([...body.rows].sort((a: any, b: any) => a.stage.localeCompare(b.stage))).toEqual([
      expect.objectContaining({ stage: "extract", docs: 12, failures: 2, dropouts: 1 }),
      expect.objectContaining({ stage: "ocr", docs: 14, failures: 1, dropouts: 0, avg_queue_wait_ms: 176 }),
    ]);
  });

  it("dependencies has one span per stage item, searchable with contains", async () => {
    expect((await kql("dependencies")).body.totalRows).toBe(26);
    const { body } = await kql("dependencies | where target contains 'gpt' | take 2");
    expect(body.rows).toEqual([
      expect.objectContaining({ type: "Azure OpenAI", target: "gpt-5.4-mini" }),
      expect.objectContaining({ type: "Azure OpenAI", target: "gpt-5.4-mini" }),
    ]);
  });

  it("pipeline_gaps is the blob-vs-Cosmos reconciliation", async () => {
    fakeBlobs.add("docs-in", "ui/never-seen.pdf", { createdOn: "2026-10-08T11:00:00Z" });
    const { body } = await kql("pipeline_gaps");
    expect(body.rows).toEqual([expect.objectContaining({ documentId: "ui/never-seen", category: "event_grid_gap", severity: "critical" })]);
  });

  it("KNOWN BEHAVIOUR: an unknown table falls back to traces", async () => {
    const res = await kql("no_such_table | take 1");
    expect(res.body.ok).toBe(true);
    expect(res.body.columns).toContain("stage");
  });
});

describe("POST /observability-diagnose", () => {
  it("combines gaps, traces and exceptions for one document", async () => {
    fakeBlobs.add("docs-in", "ui/never-seen.pdf", { createdOn: "2026-10-08T11:00:00Z" });
    const res = await post("/observability-diagnose", { docId: "errored-1" });
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toMatchObject({
      ok: true,
      docId: "errored-1",
      gaps: [],
      pipelineSummary: { blobCount: 1, cosmosCount: 26, eventGridGaps: 1, estimatedDlqDepth: 2 },
    });
    expect(body.traces.map((t: any) => `${t.doc_id}:${t.stage}`).sort()).toEqual(["errored-1:extract", "errored-1:ocr"]);
    expect(body.exceptions).toEqual([expect.objectContaining({ doc_id: "errored-1", error_message: "model timeout" })]);
  });

  it("answers the same on /observability/diagnose", async () => {
    const a = stableTimes((await post("/observability/diagnose", { docId: "slow-1" })).body);
    const b = stableTimes((await post("/observability-diagnose", { docId: "slow-1" })).body);
    expect(a).toEqual(b);
  });

  it("rejects unsafe docId characters instead of pasting them into KQL unescaped", async () => {
    const res = await post("/observability-diagnose", { docId: 'x" or "' });
    expect(res.status).toBe(400);
    expect((res.body as any).ok).toBe(false);
  });
});

describe("POST /observability-chat", () => {
  const chat = (content: string, extra: Record<string, unknown> = {}) =>
    post("/observability-chat", { messages: [{ role: "user", content }], ...extra });

  it("needs at least one message", async () => {
    expect(await post("/observability-chat", {})).toEqual({
      status: 400,
      body: { ok: false, reply: "Please provide a query or message for the Observability Copilot." },
    });
  });

  describe("without OPENAI_API_KEY (heuristic fallback, no model call)", () => {
    it.each([
      ["an upload question runs gap detection", "my upload is stuck", "### Pipeline Gap & Upload Telemetry", "pipeline_gaps"],
      ["a dropout question runs the dropout query", "why the tool dropout?", "### Live Telemetry RCA", "genai_tool_call_dropout == true"],
      ["a latency question runs the queue-wait query", "queue latency please", "### Live Telemetry RCA", "queue_wait_ms > 500"],
      ["anything else gets the overview", "how are we doing", "### Live Telemetry RCA", "summarize"],
    ])("%s", async (_label, question, heading, query) => {
      const res = await chat(question);
      const body = res.body as any;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.reply.startsWith(heading)).toBe(true);
      expect(body.kqlExecuted).toHaveLength(1);
      expect(body.kqlExecuted[0].query).toContain(query);
      expect(body.telemetrySnapshot).toEqual({ recordCount: 26, failureCount: 2, dropoutCount: 1, avgQueueWaitMs: 176 });
      expect(fakeHttp.requests).toEqual([]);
    });
  });

  describe("with OPENAI_API_KEY", () => {
    beforeEach(() => configureEnv({ OPENAI_API_KEY: "fake-openai-key", OPENAI_BASE_URL: "https://openai.test/v1" }));

    it("runs the tool the model asks for, then returns the model's answer", async () => {
      let turn = 0;
      fakeHttp.on("POST", OPENAI, () => {
        turn += 1;
        if (turn === 1) {
          return json({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    { id: "c1", type: "function", function: { name: "execute_kql", arguments: '{"query":"traces | where queue_wait_ms > 500"}' } },
                    { id: "c2", type: "function", function: { name: "query_azure_monitor", arguments: '{"query":"AppTraces | take 1"}' } },
                  ],
                },
              },
            ],
          });
        }
        return json({ choices: [{ message: { role: "assistant", content: "**Root Cause**: queue wait." } }] });
      });

      const res = await chat("why is it slow?");
      const body = stableTimes(res.body) as any;
      expect(res.status).toBe(200);
      expect(body.reply).toBe("**Root Cause**: queue wait.");
      expect(body.toolCallsExecuted.map((t: any) => t.name)).toEqual(["execute_kql", "query_azure_monitor"]);
      expect(body.kqlExecuted.map((k: any) => k.title)).toEqual(["KQL Agent Execution", "Azure Monitor Query"]);
      // 22 ocr/extract items in the corpus + 4 here; queue wait (13 x 120 + 900) / 14.
      expect(body.telemetrySnapshot).toEqual({ recordCount: 26, failureCount: 2, dropoutCount: 1, avgQueueWaitMs: 176 });
      expect(monitorQueries).toEqual(["AppTraces | take 1"]);

      const requests = fakeHttp.to(OPENAI);
      expect(requests).toHaveLength(2);
      expect(requests[0].headers.authorization).toBe("Bearer fake-openai-key");
      const first = requests[0].body as any;
      expect(first.model).toBe("gpt-4o-mini");
      expect(first.tools.map((t: any) => t.function.name)).toEqual([
        "execute_kql",
        "detect_pipeline_gaps",
        "get_document_journey",
        "get_telemetry_aggregates",
        "query_azure_monitor",
        "run_diagnostic_playbook",
      ]);
      expect(first.messages[0].content).toContain("- Record Count: 26");
      // The tool output, document ids included, goes back to the model.
      const toolMessage = (requests[1].body as any).messages.find((m: any) => m.role === "tool");
      expect(toolMessage.content).toContain("slow-1");
    });

    it("falls back to the heuristic answer when the model call fails", async () => {
      fakeHttp.on("POST", OPENAI, () => json({ error: { message: "rate limited" } }, 429));
      const body = (await chat("how are we doing")).body as any;
      expect(body.ok).toBe(true);
      expect(body.reply).toMatch(/^### Live Telemetry RCA/);
    });
  });

  it("with a key but no OPENAI_BASE_URL, the copilot falls back to heuristic RCA instead of calling api.openai.com (PHI BAA enforcement)", async () => {
    configureEnv({ OPENAI_API_KEY: "fake-openai-key" });
    const res = await chat("hello");
    expect(res.status).toBe(200);
    expect((res.body as any).reply).toMatch(/^### Live Telemetry RCA/);
    expect(fakeHttp.to("https://api.openai.com")).toHaveLength(0);
  });
});

describe("GET /schema and POST /schemas/sync", () => {
  const localSchemas = fs.readdirSync(path.join(process.cwd(), "analyzers", "out", "schemas")).filter((f) => f.endsWith(".json"));

  it("prefers the blob copy, and caches it", async () => {
    fakeBlobs.add("schemas", "referralForm.json", { content: JSON.stringify({ from: "blob" }) });
    expect(await get("/schema", { docType: "referralForm" })).toEqual({
      status: 200,
      body: { ok: true, docType: "referralForm", source: "blob", schema: { from: "blob" } },
    });
    fakeBlobs.add("schemas", "referralForm.json", { content: JSON.stringify({ from: "blob v2" }) });
    expect(((await get("/schema", { docType: "referralForm" })).body as any).schema).toEqual({ from: "blob" });
  });

  it("falls back to analyzers/out/schemas, and defaults to referralForm", async () => {
    const res = await get("/schema");
    const local = JSON.parse(fs.readFileSync(path.join(process.cwd(), "analyzers/out/schemas/referralForm.json"), "utf8"));
    expect(res).toEqual({ status: 200, body: { ok: true, docType: "referralForm", source: "local", schema: local } });
    expect(((await get("/schema", { type: "labReport" })).body as any).docType).toBe("labReport");
  });

  it("is 404 for an unknown type", async () => {
    expect(await get("/schema", { docType: "nope" })).toEqual({
      status: 404,
      body: { ok: false, docType: "nope", source: "none", schema: null },
    });
  });

  it("sync uploads every local schema to the `schemas` container", async () => {
    const res = await post("/schemas/sync", {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, uploaded: localSchemas, failed: [] });
    expect(fakeBlobs.createdContainers).toEqual(["schemas"]);
    expect(fakeBlobs.names("schemas")).toEqual([...localSchemas].sort());
    expect(fakeBlobs.get("schemas", "referralForm.json")?.contentType).toBe("application/json");
  });

  it("sync without storage configured is a 500", async () => {
    configureEnv({ AZURE_STORAGE_KEY: "" });
    expect((await post("/schemas/sync", {})).status).toBe(500);
  });

  it("ignores path traversal docType values in blob schema lookup", async () => {
    fakeBlobs.add("schemas", "../secret.json", { content: JSON.stringify({ secret: true }) });
    const res = await get("/schema", { docType: "../secret" });
    expect(res.status).toBe(404);
  });
});

describe("Observability security hardening", () => {
  it("strips client-supplied system role messages before calling the LLM", async () => {
    configureEnv({ OPENAI_API_KEY: "fake-openai-key", OPENAI_BASE_URL: "https://oai.test/v1" });
    fakeHttp.on("POST", "https://oai.test/v1/chat/completions", () =>
      json({ choices: [{ message: { content: "ok" } }] })
    );

    const res = await post("/observability-chat", {
      messages: [
        { role: "system", content: "INJECTED_SYSTEM_PROMPT" },
        { role: "user", content: "status?" },
      ],
    });
    expect(res.status).toBe(200);
    const reqBody = fakeHttp.to("https://oai.test/v1")[0].body as any;
    expect(reqBody.messages).toHaveLength(2);
    expect(reqBody.messages[0].role).toBe("system");
    expect(reqBody.messages[0].content).not.toContain("INJECTED_SYSTEM_PROMPT");
    expect(reqBody.messages[1]).toEqual({ role: "user", content: "status?" });
  });

  it("rejects unsafe docId/runId in POST /observability-diagnose", async () => {
    const res1 = await post("/observability-diagnose", { docId: 'x" | drop table' });
    expect(res1.status).toBe(400);
    const res2 = await post("/observability-diagnose", { runId: "run; .show tables" });
    expect(res2.status).toBe(400);
  });

  it("rejects path traversal in GET /document?documentId=", async () => {
    const res = await get("/document", { documentId: "../../etc/passwd" });
    expect(res.status).toBe(400);
  });
});


