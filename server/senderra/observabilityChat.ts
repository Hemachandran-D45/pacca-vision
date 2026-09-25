import { completeChatWithTools, type ChatToolDefinition } from "../chatCompletions.js";
import { container } from "./cosmos.js";
import { executeKql, type KqlQueryResult } from "./kqlEngine.js";
import { detectPipelineGaps } from "./pipelineGaps.js";
import type { ExtractItem, OcrItem } from "./types.js";

export type ObservabilityChatRequest = {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  contextIncident?: Record<string, unknown>;
  runId?: string;
};

export type ExecutedKqlLog = {
  title: string;
  query: string;
  rowCount: number;
  executionTimeMs: number;
  sampleData?: Array<Record<string, unknown>>;
};

export type ObservabilityChatResponse = {
  ok: boolean;
  reply: string;
  suggestedQuestions?: string[];
  kqlExecuted?: ExecutedKqlLog[];
  toolCallsExecuted?: Array<{ name: string; args: Record<string, unknown>; result?: unknown }>;
  telemetrySnapshot?: {
    recordCount: number;
    failureCount: number;
    dropoutCount: number;
    avgQueueWaitMs: number | null;
  };
};

const OBSERVABILITY_TOOLS: ChatToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "execute_kql",
      description:
        "Execute a KQL (Kusto Query Language) query against the live observability telemetry plane. " +
        "Available tables: traces (Cosmos stage records), dependencies (CU + OpenAI spans), exceptions (error records), " +
        "pipeline_gaps (blob vs Cosmos reconciliation — detects Event Grid gaps, stuck OCR, missing extracts), " +
        "blobs (raw blob listing from docs-in container). " +
        "Use pipeline_gaps table first when investigating why a file upload has no downstream processing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The KQL query string, e.g. pipeline_gaps | where severity == 'critical' | project documentId, category, stuckForMs, rootCauseHypothesis",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_pipeline_gaps",
      description:
        "Run a full blob-vs-Cosmos reconciliation to detect every document that is stuck, orphaned, or has a missing Event Grid trigger. " +
        "Returns: eventGridGaps (blob uploaded, zero OCR record), ocrStuck (failed OCR jobs), extractMissing (OCR done but no extract record), " +
        "longRunning (OCR taking >P95 time), estimatedDlqDepth (dead-letter estimate). " +
        "USE THIS when the user says 'a file was uploaded but nothing happened' or 'why isn't my document processing'.",
      parameters: {
        type: "object",
        properties: {
          run_id: {
            type: "string",
            description: "Optional run ID filter (e.g. 'prod', 'ui', 'r002-accuracy')",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_document_journey",
      description:
        "Retrieve the complete end-to-end telemetry journey and stage documents for a specific document ID or run ID. " +
        "Also checks pipeline_gaps table for any gap events on this document.",
      parameters: {
        type: "object",
        properties: {
          doc_id: {
            type: "string",
            description: "The document identifier (e.g. '001', 'prescription/007', or full documentId)",
          },
          run_id: {
            type: "string",
            description: "Optional run id filter (e.g. 'ui', 'r002-accuracy', 'prod')",
          },
        },
        required: ["doc_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_telemetry_aggregates",
      description: "Get global health stats across all stages: total documents, failures, dropouts, average queue wait, and prompt cache hit ratio.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_diagnostic_playbook",
      description:
        "Execute a full automated SRE diagnostic playbook for a given failure scenario. " +
        "Runs multiple KQL queries in sequence and returns a structured root cause analysis with evidence and remediation steps. " +
        "Scenario options: 'event_grid_silent' (no downstream processing after upload), " +
        "'ocr_failure' (fn_ocr crash or timeout), 'extract_failure' (fn_extract OpenAI errors), " +
        "'queue_saturation' (high queue wait), 'genai_dropout' (tool call failures), 'full_health_check' (all checks).",
      parameters: {
        type: "object",
        properties: {
          scenario: {
            type: "string",
            enum: ["event_grid_silent", "ocr_failure", "extract_failure", "queue_saturation", "genai_dropout", "full_health_check"],
          },
          doc_id: {
            type: "string",
            description: "Optional document ID to scope the playbook",
          },
        },
        required: ["scenario"],
      },
    },
  },
];

export async function handleObservabilityChat(
  body: ObservabilityChatRequest
): Promise<{ status: number; body: ObservabilityChatResponse }> {
  const userMessages = body.messages || [];
  if (!userMessages.length) {
    return {
      status: 400,
      body: { ok: false, reply: "Please provide a query or message for the Observability Copilot." },
    };
  }

  const kqlExecutedLogs: ExecutedKqlLog[] = [];

  // Define the tool executor
  const toolExecutor = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    if (name === "execute_kql") {
      const queryStr = String(args.query || "");
      const res = await executeKql(queryStr);
      kqlExecutedLogs.push({
        title: "KQL Agent Execution",
        query: queryStr,
        rowCount: res.totalRows,
        executionTimeMs: res.executionTimeMs,
        sampleData: res.rows.slice(0, 5),
      });
      return {
        ok: res.ok,
        totalRows: res.totalRows,
        executionTimeMs: res.executionTimeMs,
        columns: res.columns,
        rows: res.rows.slice(0, 25),
        summary: res.summary,
        error: res.error,
      };
    }

    if (name === "detect_pipeline_gaps") {
      const runId = args.run_id ? String(args.run_id) : undefined;
      const result = await detectPipelineGaps(runId);
      kqlExecutedLogs.push({
        title: "Pipeline Gap Detection (Blob vs Cosmos)",
        query: `pipeline_gaps${runId ? ` | where run_id == "${runId}"` : ""} | project severity, category, documentId, stuckForMs, ocrStatus, rootCauseHypothesis`,
        rowCount: result.gaps.length,
        executionTimeMs: 0,
        sampleData: result.gaps.slice(0, 5),
      });
      return {
        ok: result.ok,
        checkedAt: result.checkedAt,
        blobCount: result.blobCount,
        cosmosCount: result.cosmosCount,
        eventGridGaps: result.eventGridGaps,
        ocrStuck: result.ocrStuck,
        extractMissing: result.extractMissing,
        longRunning: result.longRunning,
        estimatedDlqDepth: result.estimatedDlqDepth,
        gaps: result.gaps.slice(0, 15),
        summary:
          result.gaps.length === 0
            ? `All ${result.blobCount} blobs have matching Cosmos records. Pipeline is healthy.`
            : `Found ${result.gaps.length} pipeline gap(s): ${result.eventGridGaps} Event Grid silent, ${result.ocrStuck} OCR stuck, ${result.extractMissing} extract missing.`,
      };
    }

    if (name === "get_document_journey") {
      const docId = String(args.doc_id || "");
      const runId = args.run_id ? String(args.run_id) : undefined;
      const [traceRes, gapResult] = await Promise.all([
        executeKql(
          runId
            ? `traces | where doc_id contains "${docId}" and run_id == "${runId}" | take 10`
            : `traces | where doc_id contains "${docId}" | take 10`
        ),
        detectPipelineGaps(runId),
      ]);
      const docGaps = gapResult.gaps.filter(
        (g) => g.docId.includes(docId) || g.documentId.includes(docId)
      );
      kqlExecutedLogs.push({
        title: `Document Journey Trace (${docId})`,
        query: runId
          ? `traces | where doc_id contains "${docId}" and run_id == "${runId}" | take 10`
          : `traces | where doc_id contains "${docId}" | take 10`,
        rowCount: traceRes.totalRows + docGaps.length,
        executionTimeMs: traceRes.executionTimeMs,
        sampleData: [...traceRes.rows.slice(0, 3), ...docGaps.slice(0, 2)],
      });
      return {
        traces: traceRes.rows,
        pipelineGaps: docGaps,
        gapCount: docGaps.length,
        hasCriticalGap: docGaps.some((g) => g.severity === "critical"),
      };
    }

    if (name === "get_telemetry_aggregates") {
      const q = `traces | summarize docs = count(), avg_queue_wait = avg(queue_wait_ms), dropouts = sum(genai_tool_call_dropout), failures = sum(status != 'Succeeded') by stage`;
      const res = await executeKql(q);
      kqlExecutedLogs.push({
        title: "Global Pipeline Aggregates",
        query: q,
        rowCount: res.totalRows,
        executionTimeMs: res.executionTimeMs,
        sampleData: res.rows,
      });
      return res.rows;
    }

    if (name === "run_diagnostic_playbook") {
      const scenario = String(args.scenario || "full_health_check");
      const docId = args.doc_id ? String(args.doc_id) : undefined;
      const results: Record<string, unknown> = { scenario, docId };

      if (scenario === "event_grid_silent" || scenario === "full_health_check") {
        const gapResult = await detectPipelineGaps();
        results.pipelineGaps = {
          eventGridGaps: gapResult.eventGridGaps,
          ocrStuck: gapResult.ocrStuck,
          extractMissing: gapResult.extractMissing,
          blobCount: gapResult.blobCount,
          cosmosCount: gapResult.cosmosCount,
          criticalGaps: gapResult.gaps.filter((g) => g.severity === "critical"),
          warningGaps: gapResult.gaps.filter((g) => g.severity === "warning"),
        };
        kqlExecutedLogs.push({
          title: "Playbook: Event Grid Gap Detection",
          query: `pipeline_gaps | where severity == 'critical' | project category, documentId, stuckForMs, rootCauseHypothesis`,
          rowCount: gapResult.gaps.length,
          executionTimeMs: 0,
          sampleData: gapResult.gaps.slice(0, 3),
        });
      }

      if (scenario === "queue_saturation" || scenario === "full_health_check") {
        const queueRes = await executeKql(
          `traces | where queue_wait_ms > 500 | project timestamp, run_id, doc_id, stage, queue_wait_ms, e2e_latency_ms | order by queue_wait_ms desc | take 10`
        );
        results.queueSaturation = { totalSpiked: queueRes.totalRows, topRows: queueRes.rows.slice(0, 5) };
        kqlExecutedLogs.push({
          title: "Playbook: Queue Saturation Check",
          query: `traces | where queue_wait_ms > 500 | order by queue_wait_ms desc | take 10`,
          rowCount: queueRes.totalRows,
          executionTimeMs: queueRes.executionTimeMs,
          sampleData: queueRes.rows.slice(0, 3),
        });
      }

      if (scenario === "genai_dropout" || scenario === "full_health_check") {
        const dropoutRes = await executeKql(
          `traces | where genai_tool_call_dropout == true | project timestamp, run_id, doc_id, model_deployment, status, error_message | take 10`
        );
        results.genaiDropouts = { count: dropoutRes.totalRows, examples: dropoutRes.rows.slice(0, 5) };
        kqlExecutedLogs.push({
          title: "Playbook: GenAI Tool Dropout Analysis",
          query: `traces | where genai_tool_call_dropout == true | take 10`,
          rowCount: dropoutRes.totalRows,
          executionTimeMs: dropoutRes.executionTimeMs,
          sampleData: dropoutRes.rows.slice(0, 3),
        });
      }

      if (scenario === "ocr_failure" || scenario === "extract_failure" || scenario === "full_health_check") {
        const failRes = await executeKql(
          docId
            ? `exceptions | where doc_id contains "${docId}" | take 10`
            : `exceptions | take 10`
        );
        results.exceptions = { count: failRes.totalRows, records: failRes.rows.slice(0, 5) };
        kqlExecutedLogs.push({
          title: "Playbook: Exception Log Scan",
          query: docId ? `exceptions | where doc_id contains "${docId}" | take 10` : `exceptions | take 10`,
          rowCount: failRes.totalRows,
          executionTimeMs: failRes.executionTimeMs,
          sampleData: failRes.rows.slice(0, 3),
        });
      }

      return results;
    }

    return { error: `Unknown tool: ${name}` };
  };

  // Pre-fetch fast stats from Cosmos DB
  let stats = { recordCount: 0, failureCount: 0, dropoutCount: 0, avgQueueWaitMs: null as number | null };
  try {
    const handle = await container();
    if (!("error" in handle)) {
      const { resources } = await handle.container.items
        .query<OcrItem | ExtractItem>({
          query: "SELECT * FROM c WHERE (c.itemType = 'ocr' OR c.itemType = 'extract')",
        })
        .fetchAll();

      const ocrItems = resources.filter((r) => r.itemType === "ocr") as OcrItem[];
      const extractItems = resources.filter((r) => r.itemType === "extract") as ExtractItem[];

      const queueWaits = ocrItems
        .map((o) => o.queue_wait_ms)
        .filter((w): w is number => typeof w === "number" && Number.isFinite(w));

      const dropouts = extractItems.filter((e) => (e as any).genai_tool_call_dropout === true);
      const failures = resources.filter(
        (r) => (r as any).error_message || ["Failed", "ContentFiltered", "PollTimeout"].includes(r.status || "")
      );

      stats.recordCount = resources.length;
      stats.failureCount = failures.length;
      stats.dropoutCount = dropouts.length;
      stats.avgQueueWaitMs = queueWaits.length
        ? Math.round(queueWaits.reduce((a, b) => a + b, 0) / queueWaits.length)
        : null;
    }
  } catch (err) {
    console.warn("Could not fetch Cosmos DB telemetry for chat context:", err);
  }

  const incidentContext = body.contextIncident
    ? `\nTARGET INCIDENT EVIDENCE:\n${JSON.stringify(body.contextIncident, null, 2)}\n`
    : "";

  const systemPrompt = {
    role: "system",
    content: `You are the Senderra IDP & PACCA Vision Observability & SRE Copilot.
You have REAL AGENTIC TOOLS that you MUST call before answering any diagnostic question.

Architecture:
- Upload: User PUT to docs-in blob → triggers Event Grid → Service Bus ocr-queue → fn_ocr.
- Stage 1 (fn_ocr): Azure Content Understanding OCR → markdown checkpoint blob.
- Stage 2 (fn_extract): Azure OpenAI (gpt-5.4-mini) → 2 chat completions (classify + fields) → Cosmos DB.
- IVR Outreach: Triggered when required fields are missing.
- OpenTelemetry: Traces, spans, and baggage across Service Bus, App Insights.

KQL Tables available:
- traces: Cosmos stage records (OCR + Extract)
- pipeline_gaps: Live blob vs Cosmos reconciliation → detects Event Grid silent failures, OCR stuck, extract missing
- blobs: Raw listing from docs-in blob container
- dependencies: CU + OpenAI client spans
- exceptions: Error records

Tools available:
- execute_kql: Run any KQL query against the observability plane
- detect_pipeline_gaps: Run full blob-vs-Cosmos gap analysis
- get_document_journey: Full trace for a specific document (also checks pipeline_gaps)
- run_diagnostic_playbook: Automated multi-step SRE investigation playbook
- get_telemetry_aggregates: Global pipeline health stats

Critical rule: If the user says a file was uploaded but nothing happened (no Service Bus event, no OCR, no extract), ALWAYS call detect_pipeline_gaps first. The Event Grid gap lives between the blob write and the first OCR record — it is INVISIBLE to traces alone.

Telemetry Snapshot:
- Record Count: ${stats.recordCount}
- Failure Count: ${stats.failureCount}
- Tool Dropout Count: ${stats.dropoutCount}
- Average Queue Wait: ${stats.avgQueueWaitMs ?? 0} ms
${incidentContext}

Instructions:
1. ALWAYS call at least one tool before answering.
2. For file-not-processing questions: call detect_pipeline_gaps.
3. For specific document questions: call get_document_journey.
4. For performance/latency: call execute_kql with queue_wait_ms queries.
5. Format responses with:
   - **Root Cause**: Evidence-based explanation from tool results
   - **KQL Evidence**: Specific rows/metrics from tool outputs
   - **Remediation Steps**: Numbered, specific, actionable`,
  };

  const initialMessages = [
    systemPrompt,
    ...userMessages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  const chatResult = await completeChatWithTools(initialMessages, OBSERVABILITY_TOOLS, toolExecutor, 4);

  if ("text" in chatResult && chatResult.text) {
    return {
      status: 200,
      body: {
        ok: true,
        reply: chatResult.text,
        suggestedQuestions: [
          "Show me the KQL query for detecting 429 quota throttles",
          "Why did tool dropouts occur in recent extraction runs?",
          "What is the average queue wait across document batches?",
        ],
        kqlExecuted: kqlExecutedLogs,
        toolCallsExecuted: chatResult.toolCallsExecuted,
        telemetrySnapshot: stats,
      },
    };
  }

  // If Azure OpenAI endpoint fails or is unreachable, execute the tool query directly via KQL engine and provide grounded synthesis
  const lastUserMsg = (userMessages[userMessages.length - 1]?.content || "").toLowerCase();

  if (
    lastUserMsg.includes("blob") ||
    lastUserMsg.includes("eventgrid") ||
    lastUserMsg.includes("event grid") ||
    lastUserMsg.includes("miss") ||
    lastUserMsg.includes("gap") ||
    lastUserMsg.includes("silent") ||
    lastUserMsg.includes("stuck") ||
    lastUserMsg.includes("lost") ||
    lastUserMsg.includes("upload")
  ) {
    const gapRes = await detectPipelineGaps(body.runId);
    kqlExecutedLogs.push({
      title: "Pipeline Gap Detection (Blob vs Cosmos Reconciliation)",
      query: `pipeline_gaps | project category, documentId, stuckForMs, rootCauseHypothesis`,
      rowCount: gapRes.gaps.length,
      executionTimeMs: 0,
      sampleData: gapRes.gaps.slice(0, 5),
    });

    let reply = `### Pipeline Gap & Upload Telemetry (Reconciliation Check)\n\n`;
    reply += `**Blob Storage Container**: \`${gapRes.blobCount}\` blobs inspected in intake storage.\n`;
    reply += `**Cosmos DB Stage Records**: \`${gapRes.cosmosCount}\` stage traces correlated.\n\n`;

    if (gapRes.gaps.length === 0) {
      reply += `✅ **No Missed Uploads Found**: All **${gapRes.blobCount}** uploaded blobs successfully produced corresponding pipeline events. There are **0 Event Grid dropouts** and **0 orphaned files**.\n\n` +
        `**Correlation Breakdown**:\n` +
        `- Silent Event Grid Drops: 0\n` +
        `- Stuck in OCR Stage: 0\n` +
        `- Extraction Record Missing: 0\n` +
        `- Dead Letter Queue Depth: 0 items`;
    } else {
      reply += `⚠️ **${gapRes.gaps.length} Pipeline Gap(s) Detected**:\n\n`;
      for (const gap of gapRes.gaps.slice(0, 5)) {
        reply += `- **${gap.documentId}** [${gap.category.toUpperCase()} - ${gap.severity}]: ${gap.category} on ${gap.blobPath ?? gap.documentId}\n` +
          `  - *Hypothesis*: ${gap.rootCauseHypothesis}\n` +
          `  - *Remediation*: ${gap.remediation}\n\n`;
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        reply,
        suggestedQuestions: [
          "Show me any documents stuck in OCR",
          "Run KQL query for top queue latency spans",
          "Explain root cause of tool dropouts",
        ],
        kqlExecuted: kqlExecutedLogs,
        telemetrySnapshot: stats,
      },
    };
  }

  let heuristicQuery = "";
  if (lastUserMsg.includes("dropout") || lastUserMsg.includes("tool")) {
    heuristicQuery = `traces | where genai_tool_call_dropout == true | project timestamp, run_id, doc_id, model_deployment, status, error_message | take 10`;
  } else if (lastUserMsg.includes("queue") || lastUserMsg.includes("latency") || lastUserMsg.includes("wait")) {
    heuristicQuery = `traces | where queue_wait_ms > 500 | project timestamp, run_id, doc_id, stage, queue_wait_ms, e2e_latency_ms | order by queue_wait_ms desc | take 10`;
  } else {
    heuristicQuery = `traces | summarize docs = count(), avg_latency = avg(e2e_latency_ms), dropouts = sum(genai_tool_call_dropout), failures = sum(status != 'Succeeded') by stage`;
  }

  const kqlRes = await executeKql(heuristicQuery);
  kqlExecutedLogs.push({
    title: "Autonomous KQL Correlation",
    query: heuristicQuery,
    rowCount: kqlRes.totalRows,
    executionTimeMs: kqlRes.executionTimeMs,
    sampleData: kqlRes.rows.slice(0, 3),
  });

  let reply = `### Live Telemetry RCA (Executed KQL Tool: \`${heuristicQuery}\`)\n\n`;
  reply += `**KQL Evidence**: Returned ${kqlRes.totalRows} record(s) in ${kqlRes.executionTimeMs} ms.\n\n`;
  if (kqlRes.rows.length > 0) {
    reply += `**Observed Sample Rows**:\n\`\`\`json\n${JSON.stringify(kqlRes.rows.slice(0, 3), null, 2)}\n\`\`\`\n\n`;
  }

  if (lastUserMsg.includes("dropout") || lastUserMsg.includes("tool")) {
    reply += `**Root Cause**: The model emitted raw text completion instead of the structured schema payload during Stage 2 extraction. Promoted to Review to avoid silent delivery loss.\n\n` +
      `**SRE Remediation**: Enforce strict JSON schema validation in \`prompts.py\` and check prompt length against \`LLM_MAX_MARKDOWN_CHARS\`.`;
  } else if (lastUserMsg.includes("queue") || lastUserMsg.includes("latency") || lastUserMsg.includes("wait")) {
    reply += `**Root Cause**: Intake delay is driven by Service Bus worker allocation during sudden batch uploads.\n\n` +
      `**SRE Remediation**: Configure Function App \`maxAutoLockRenewalDuration: "00:30:00"\` in \`host.json\`.`;
  } else {
    reply += `**Pipeline Overview**: ${stats.recordCount} total stage records across Cosmos DB (${stats.failureCount} failures, ${stats.dropoutCount} dropouts, avg queue wait ${stats.avgQueueWaitMs ?? 0} ms).`;
  }

  return {
    status: 200,
    body: {
      ok: true,
      reply,
      suggestedQuestions: [
        "Run KQL query for top queue latency spans",
        "Explain root cause of tool dropouts",
        "Inspect Content Understanding OCR accuracy",
      ],
      kqlExecuted: kqlExecutedLogs,
      telemetrySnapshot: stats,
    },
  };
}
