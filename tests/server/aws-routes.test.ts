import { describe, expect, it, beforeEach, vi } from "vitest";
import { handleSenderra } from "../../server/senderra/api.js";
import { CloudAdapterRegistry } from "../../server/adapters/registry.js";
import { as, configureEnv, STAFF } from "./fakes/env.js";

describe("AWS Cloud Dispatch Pipeline", () => {
  beforeEach(() => {
    configureEnv({
      CLOUD_PROVIDER: "aws",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
      AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      AWS_S3_BUCKET: "test-claims-bucket",
      AWS_DYNAMODB_TABLE: "test_pacca_documents",
      AWS_BEDROCK_MODEL_ID: "anthropic.claude-3-5-haiku-20241022-v1:0",
    });

    CloudAdapterRegistry.setConfig({
      provider: "aws",
      aws: {
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        s3Bucket: "test-claims-bucket",
        dynamoTable: "test_pacca_documents",
        bedrockModelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
      },
    });
  });

  it("POST /upload-sas returns an S3 pre-signed upload grant", async () => {
    const res = await handleSenderra(
      "POST",
      "/upload-sas",
      new URLSearchParams(),
      { files: [{ name: "patient-rx-001.pdf" }] },
      as(STAFF)
    );

    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("aws");
    expect(body.grants).toHaveLength(1);
    expect(body.grants[0].uploadUrl).toContain("amazonaws.com");
    expect(body.grants[0].uploadUrl).toContain("test-claims-bucket");
    expect(body.grants[0].provider).toBe("aws");
  });

  it("POST /process-document accepts and begins processing", async () => {
    vi.spyOn(CloudAdapterRegistry.getStorage(), "readBuffer").mockResolvedValue(Buffer.from("sample document"));
    vi.spyOn(CloudAdapterRegistry.getParser(), "parseDocument").mockResolvedValue({
      documentId: "doc-test-123",
      pageCount: 1,
      markdownContent: "# Sample Document",
      rawText: "Sample Document",
      tokens: [],
    });
    vi.spyOn(CloudAdapterRegistry.getExtractor(), "extractStructuredData").mockResolvedValue({
      extractedFields: { patientName: "Jane Doe" },
      confidence: 0.98,
      rawLlmOutput: "{}",
    });
    vi.spyOn(CloudAdapterRegistry.getLedger(), "saveDocumentSummary").mockResolvedValue();

    const res = await handleSenderra(
      "POST",
      "/process-document",
      new URLSearchParams(),
      {
        documentId: "doc-test-123",
        fileKey: "test-claims-bucket/doc-test-123.pdf",
      },
      as(STAFF)
    );

    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.accepted).toBe(true);
    expect(body.documentId).toBe("doc-test-123");
  });

  it("GET /stats returns AWS aggregated document metrics", async () => {
    const ledger = CloudAdapterRegistry.getLedger();
    vi.spyOn(ledger, "listDocuments").mockResolvedValue([
      { documentId: "doc-1", status: "Processed" },
      { documentId: "doc-2", status: "Needs Review" },
    ]);

    const res = await handleSenderra("GET", "/stats", new URLSearchParams(), {}, as(STAFF));
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.stats.totalDocuments).toBe(2);
    expect(body.stats.processed).toBe(1);
    expect(body.stats.needsReview).toBe(1);
  });
});
