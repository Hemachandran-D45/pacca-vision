import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { IModelExtractorAdapter, CloudProvider } from "../types.js";

export type AwsBedrockExtractorConfig = {
  region: string;
  defaultModelId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

/**
 * Amazon Bedrock Structured Extraction Adapter
 *
 * Consumes high-fidelity Markdown produced by Bedrock Data Automation (BDA),
 * executes schema-constrained reasoning with Claude 3.5 Sonnet / Haiku, and returns
 * structured typed JSON matching PACCA Solutions schemas.
 */
export class AwsBedrockExtractorAdapter implements IModelExtractorAdapter {
  public provider: CloudProvider = "aws";
  private bedrockRuntime: BedrockRuntimeClient;
  private defaultModelId: string;

  constructor(config: AwsBedrockExtractorConfig) {
    const clientConfig: any = { region: config.region };
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    this.bedrockRuntime = new BedrockRuntimeClient(clientConfig);
    this.defaultModelId =
      config.defaultModelId || "anthropic.claude-3-5-sonnet-20241022-v2:0";
  }

  async extractStructuredData(input: {
    documentId: string;
    markdownOrText: string;
    schemaGuidance: string;
    fieldSchema: Record<string, unknown>;
    modelId?: string;
  }): Promise<{
    extractedFields: Record<string, unknown>;
    confidence: number;
    rawLlmOutput: string;
    tokenUsage?: { promptTokens: number; completionTokens: number };
  }> {
    const targetModel = input.modelId || this.defaultModelId;

    const systemPrompt = `You are a precision enterprise IDP extraction engine.
You will receive a document rendered in clean Markdown (generated via AWS Bedrock Data Automation).
Extract the required fields strictly according to the specified JSON schema and guidance.
Rules:
1. Return ONLY a valid JSON object matching the requested schema. No conversational markdown wrap like \`\`\`json.
2. If a field is not found in the document, return null. Never fabricate values.
3. Include a "_confidence" float (0.0 to 1.0) representing overall extraction confidence.`;

    const userPrompt = `DOCUMENT MARKDOWN CONTENT:
----------------------------
${input.markdownOrText}
----------------------------

EXTRACTION GUIDANCE & RULES:
${input.schemaGuidance}

REQUESTED SCHEMA PROPERTIES:
${JSON.stringify(input.fieldSchema, null, 2)}

Output the extracted JSON now:`;

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 4096,
      temperature: 0.0,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    };

    const command = new InvokeModelCommand({
      modelId: targetModel,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await this.bedrockRuntime.send(command);
    const resBody = JSON.parse(new TextDecoder().decode(response.body));
    const rawText = resBody.content?.[0]?.text?.trim() || "{}";

    let parsed: Record<string, unknown> = {};
    try {
      const cleanJson = rawText.replace(/^```json/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleanJson);
    } catch {
      console.warn("Failed to parse Claude output directly as JSON, returning fallback object.");
      parsed = { rawContent: rawText };
    }

    const confidence =
      typeof parsed._confidence === "number" ? parsed._confidence : 0.94;
    delete parsed._confidence;

    return {
      extractedFields: parsed,
      confidence,
      rawLlmOutput: rawText,
      tokenUsage: {
        promptTokens: resBody.usage?.input_tokens || 0,
        completionTokens: resBody.usage?.output_tokens || 0,
      },
    };
  }
}
