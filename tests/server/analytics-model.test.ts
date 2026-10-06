import { describe, expect, it } from "vitest";
import { computeAnalytics } from "../../server/senderra/analytics.js";

const rows = [
  { itemType: "extract", status: "Succeeded", model_id: "gpt-5.6-luna", model_deployment: "gpt-5.6-luna", total_cost_usd: 0.02, e2e_latency_ms: 1000, needs_review: false },
  { itemType: "extract", status: "Succeeded", model_id: "gpt-5.6-luna", model_deployment: "gpt-5.6-luna", total_cost_usd: 0.04, e2e_latency_ms: 3000, needs_review: true },
  // written before the model switch: no model_id, deployment name only
  { itemType: "extract", status: "Succeeded", model_deployment: "gpt-5.4-mini", total_cost_usd: 0.07, e2e_latency_ms: 2000 },
];
const container = { items: { query: () => ({ fetchAll: async () => ({ resources: rows }) }) } } as any;

describe("spend by model", () => {
  it("groups by model_id, falling back to the deployment on older records", async () => {
    const { byModel } = await computeAnalytics(container);
    expect(byModel).toEqual([
      { model: "gpt-5.6-luna", documents: 2, spendUsd: 0.06, costPerDoc: 0.03, avgLatencyMs: 2000, reviewRate: 0.5 },
      { model: "gpt-5.4-mini", documents: 1, spendUsd: 0.07, costPerDoc: 0.07, avgLatencyMs: 2000, reviewRate: 0 },
    ]);
  });
});
