import { describe, it, expect, beforeEach } from "vitest";
import { CloudAdapterRegistry } from "../../server/adapters/registry.js";
import { AwsBedrockDataAutomationAdapter } from "../../server/adapters/aws/bedrockDataAutomation.js";
import { AwsS3StorageAdapter } from "../../server/adapters/aws/s3Storage.js";

describe("Cloud Adapters & AWS BDA Architecture", () => {
  beforeEach(() => {
    CloudAdapterRegistry.setConfig({
      provider: "aws",
      aws: {
        region: "us-east-1",
        s3Bucket: "test-client-docs-in",
        bdaBlueprintArn: "arn:aws:bedrock:us-east-1:123456789012:blueprint/clinical-v1",
        bedrockModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        dynamoTable: "test_documents",
      },
    });
  });

  it("configures AWS S3 Storage Adapter correctly", () => {
    const storage = CloudAdapterRegistry.getStorage();
    expect(storage.provider).toBe("aws");
    expect(storage).toBeInstanceOf(AwsS3StorageAdapter);
  });

  it("configures Bedrock Data Automation Markdown Adapter", () => {
    const parser = CloudAdapterRegistry.getDocumentParser();
    expect(parser.provider).toBe("aws");
    expect(parser).toBeInstanceOf(AwsBedrockDataAutomationAdapter);
  });

  it("BDA adapter generates structured Markdown and normalized bounding boxes", async () => {
    const bda = new AwsBedrockDataAutomationAdapter({
      region: "us-east-1",
      blueprintArn: "arn:aws:bedrock:us-east-1:123456789012:blueprint/clinical-v1",
    });

    const sampleText = Buffer.from(
      "# Prior Authorization Request\n\n**Patient Name:** John Doe\n**DOB:** 1980-05-12\n\n| Procedure | CPT | Status |\n|---|---|---|\n| MRI Knee | 73721 | Approved |"
    );

    const result = await bda.parseDocument("test-run/sample.txt", sampleText);

    expect(result.documentId).toBe("sample.txt");
    expect(result.markdownContent).toContain("# Prior Authorization Request");
    expect(result.markdownContent).toContain("| Procedure | CPT | Status |");
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.tokens[0].boundingBox.left).toBe(0.08);
  });
});
