/**
 * Canonical Cloud Adapter Contracts for PACCA Vision V2.0
 *
 * Implements a clean Port-and-Adapter architecture allowing PACCA to run
 * seamlessly on either Azure (Azure Blob, Content Understanding, Cosmos DB, Azure OpenAI)
 * or AWS (Amazon S3, Bedrock Data Automation Markdown, DynamoDB/Aurora, Amazon Bedrock Claude).
 */

export type CloudProvider = "azure" | "aws" | "mock";

export type NormalizedBoundingBox = {
  /** 0.0 to 1.0 normalized coordinates */
  top: number;
  left: number;
  width: number;
  height: number;
  pageNumber: number;
};

export type NormalizedOcrToken = {
  text: string;
  confidence: number;
  boundingBox: NormalizedBoundingBox;
};

export type DocumentParseResult = {
  documentId: string;
  pageCount: number;
  /**
   * For Bedrock Data Automation (BDA): Rich structured Markdown representation
   * of the document preserving tables, headings, and text flow.
   */
  markdownContent?: string;
  rawText: string;
  tokens: NormalizedOcrToken[];
  metadata?: Record<string, unknown>;
};

export type StorageUploadGrant = {
  uploadUrl: string;
  fileKey: string;
  expiresInSeconds: number;
  headers?: Record<string, string>;
};

export interface IStorageAdapter {
  provider: CloudProvider;
  mintUploadUrl(filename: string, contentType: string, runId?: string): Promise<StorageUploadGrant>;
  mintReadUrl(fileKey: string, expiresInSeconds?: number): Promise<string>;
  readBuffer(fileKey: string): Promise<Buffer>;
  deleteFile(fileKey: string): Promise<void>;
}

export interface IDocumentParserAdapter {
  provider: CloudProvider;
  parseDocument(fileKey: string, fileBuffer?: Buffer): Promise<DocumentParseResult>;
}

export interface IModelExtractorAdapter {
  provider: CloudProvider;
  extractStructuredData(
    input: {
      documentId: string;
      markdownOrText: string;
      schemaGuidance: string;
      fieldSchema: Record<string, unknown>;
      modelId?: string;
    }
  ): Promise<{
    extractedFields: Record<string, unknown>;
    confidence: number;
    rawLlmOutput: string;
    tokenUsage?: { promptTokens: number; completionTokens: number };
  }>;
}

export interface IStateLedgerAdapter {
  provider: CloudProvider;
  saveDocumentSummary(doc: Record<string, unknown>): Promise<void>;
  getDocument(documentId: string): Promise<Record<string, unknown> | null>;
  listDocuments(query?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}
