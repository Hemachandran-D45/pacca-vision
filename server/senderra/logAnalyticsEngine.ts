import { LogsQueryClient } from "@azure/monitor-query";
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

export async function queryLogAnalytics(kqlQuery: string) {
  if (!workspaceId) {
    throw new Error("LOG_ANALYTICS_WORKSPACE_ID is not configured in environment variables.");
  }

  const client = getClient();
  
  // Default to last 7 days to match Cosmos query behavior
  const result = await client.queryWorkspace(workspaceId, kqlQuery, {
    duration: "P7D"
  });

  return result.tables;
}
