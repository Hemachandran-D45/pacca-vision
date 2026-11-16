import { LogsQueryClient, LogsQueryResultStatus } from "@azure/monitor-query";
import { DefaultAzureCredential } from "@azure/identity";

const workspaceId = process.env.LOG_ANALYTICS_WORKSPACE_ID;

// Lazily instantiate to prevent startup crashes if env var is missing during build
let _client: LogsQueryClient | null = null;

function getClient() {
  if (!_client) {
    _client = new LogsQueryClient(new DefaultAzureCredential());
  }
  return _client;
}

const FORBIDDEN_KQL =
  /(?:^\s*\.)|(?:\bexternaldata\s*\()|(?:\bevaluate\b)|(?:\b(?:sql_request|http_request|cosmosdb_sql_request|azuredataexplorer)\b)/im;

export async function queryLogAnalytics(kqlQuery: string) {
  if (!workspaceId) {
    throw new Error("LOG_ANALYTICS_WORKSPACE_ID is not configured in environment variables.");
  }
  const trimmed = kqlQuery.trim();
  if (!trimmed || trimmed.length > 4000) {
    throw new Error("KQL query is empty or exceeds maximum length.");
  }
  if (FORBIDDEN_KQL.test(trimmed)) {
    throw new Error("KQL query contains disallowed control commands or external data plugins.");
  }

  const client = getClient();
  
  // Default to last 7 days to match Cosmos query behavior
  const result = await client.queryWorkspace(workspaceId, trimmed, {
    duration: "P7D"
  });

  if (result.status === LogsQueryResultStatus.Success) {
    return result.tables;
  }

  if ("tables" in result && result.tables) {
    return result.tables;
  }

  throw new Error(
    "partialError" in result && result.partialError
      ? result.partialError.message
      : "Log Analytics query failed."
  );
}
