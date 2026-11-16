import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { IStateLedgerAdapter, CloudProvider } from "../types.js";

export type AwsDynamoConfig = {
  region: string;
  tableName: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

/**
 * Amazon DynamoDB Document State Ledger Adapter
 *
 * Persists document intake records, extraction summaries, and review status
 * into an enterprise customer's DynamoDB table (pk: documentId).
 */
export class AwsDynamoDbLedgerAdapter implements IStateLedgerAdapter {
  public provider: CloudProvider = "aws";
  private client: DynamoDBClient;
  private table: string;

  constructor(config: AwsDynamoConfig) {
    this.table = config.tableName;
    const clientConfig: any = { region: config.region };
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    this.client = new DynamoDBClient(clientConfig);
  }

  async saveDocumentSummary(doc: Record<string, unknown>): Promise<void> {
    const item = {
      documentId: doc.documentId || doc.docId || doc.id || `doc-${Date.now()}`,
      updatedAt: new Date().toISOString(),
      ...doc,
    };

    const command = new PutItemCommand({
      TableName: this.table,
      Item: marshall(item, { removeUndefinedValues: true }),
    });

    await this.client.send(command);
  }

  async getDocument(documentId: string): Promise<Record<string, unknown> | null> {
    const command = new GetItemCommand({
      TableName: this.table,
      Key: marshall({ documentId }),
    });

    const response = await this.client.send(command);
    if (!response.Item) return null;
    return unmarshall(response.Item);
  }

  async listDocuments(query?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const limit = typeof query?.limit === "number" ? query.limit : 50;
    const command = new ScanCommand({
      TableName: this.table,
      Limit: limit,
    });

    const response = await this.client.send(command);
    if (!response.Items) return [];
    return response.Items.map((item) => unmarshall(item));
  }
}
