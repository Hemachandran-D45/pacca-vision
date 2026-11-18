import type {
  IStorageAdapter,
  IDocumentParserAdapter,
  IModelExtractorAdapter,
  IStateLedgerAdapter,
  CloudProvider,
} from "./types.js";
import { AwsS3StorageAdapter } from "./aws/s3Storage.js";
import { AwsBedrockDataAutomationAdapter } from "./aws/bedrockDataAutomation.js";
import { AwsBedrockExtractorAdapter } from "./aws/bedrockExtractor.js";
import { AwsDynamoDbLedgerAdapter } from "./aws/dynamoLedger.js";

export type CloudPlatformConfig = {
  provider: CloudProvider;
  aws?: {
    region: string;
    s3Bucket: string;
    bdaBlueprintArn?: string;
    bedrockModelId?: string;
    dynamoTable?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  azure?: {
    cosmosEndpoint: string;
    cosmosKey: string;
    storageAccount: string;
    storageKey: string;
    docsContainer: string;
  };
};

let currentConfig: CloudPlatformConfig = {
  provider: (process.env.CLOUD_PROVIDER as CloudProvider) || "azure",
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    s3Bucket: process.env.AWS_S3_BUCKET || "pacca-docs-in",
    bdaBlueprintArn: process.env.AWS_BDA_BLUEPRINT_ARN || "",
    bedrockModelId: process.env.AWS_BEDROCK_MODEL_ID || "anthropic.claude-3-5-haiku-20241022-v1:0",
    dynamoTable: process.env.AWS_DYNAMODB_TABLE || "pacca_documents",
  },
};

export class CloudAdapterRegistry {
  private static storageInstance: IStorageAdapter | null = null;
  private static parserInstance: IDocumentParserAdapter | null = null;
  private static extractorInstance: IModelExtractorAdapter | null = null;
  private static ledgerInstance: IStateLedgerAdapter | null = null;

  static setConfig(newConfig: Partial<CloudPlatformConfig>) {
    currentConfig = { ...currentConfig, ...newConfig };
    this.storageInstance = null;
    this.parserInstance = null;
    this.extractorInstance = null;
    this.ledgerInstance = null;
  }

  static getConfig(): CloudPlatformConfig {
    return currentConfig;
  }

  static getStorage(): IStorageAdapter {
    if (this.storageInstance) return this.storageInstance;

    if (currentConfig.provider === "aws") {
      const cfg = currentConfig.aws!;
      this.storageInstance = new AwsS3StorageAdapter({
        region: cfg.region,
        bucketName: cfg.s3Bucket,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      });
      return this.storageInstance;
    }

    // Default or Azure fallback
    throw new Error("Azure Storage Adapter configured through legacy senderra/blob.ts. Switch CLOUD_PROVIDER='aws' for AWS S3.");
  }

  static getParser(): IDocumentParserAdapter {
    return this.getDocumentParser();
  }

  static getExtractor(): IModelExtractorAdapter {
    return this.getModelExtractor();
  }

  static getLedger(): IStateLedgerAdapter {
    return this.getStateLedger();
  }

  static getDocumentParser(): IDocumentParserAdapter {
    if (this.parserInstance) return this.parserInstance;

    if (currentConfig.provider === "aws") {
      const cfg = currentConfig.aws!;
      this.parserInstance = new AwsBedrockDataAutomationAdapter({
        region: cfg.region,
        blueprintArn: cfg.bdaBlueprintArn,
        fallbackModelId: cfg.bedrockModelId,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      });
      return this.parserInstance;
    }

    throw new Error("Azure Document Parser configured through Azure Content Understanding. Switch CLOUD_PROVIDER='aws' for AWS Bedrock Data Automation.");
  }

  static getModelExtractor(): IModelExtractorAdapter {
    if (this.extractorInstance) return this.extractorInstance;

    if (currentConfig.provider === "aws") {
      const cfg = currentConfig.aws!;
      this.extractorInstance = new AwsBedrockExtractorAdapter({
        region: cfg.region,
        defaultModelId: cfg.bedrockModelId,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      });
      return this.extractorInstance;
    }

    throw new Error("Azure Model Extractor configured through Azure OpenAI. Switch CLOUD_PROVIDER='aws' for AWS Bedrock.");
  }

  static getStateLedger(): IStateLedgerAdapter {
    if (this.ledgerInstance) return this.ledgerInstance;

    if (currentConfig.provider === "aws") {
      const cfg = currentConfig.aws!;
      this.ledgerInstance = new AwsDynamoDbLedgerAdapter({
        region: cfg.region,
        tableName: cfg.dynamoTable || "pacca_documents",
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      });
      return this.ledgerInstance;
    }

    throw new Error("Azure Ledger configured through Cosmos DB. Switch CLOUD_PROVIDER='aws' for AWS DynamoDB.");
  }
}
