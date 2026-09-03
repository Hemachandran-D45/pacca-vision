/**
 * Senderra IDP connection settings.
 *
 * Every value here is server-only. None may ever be prefixed `VITE_`, because
 * Vite inlines `VITE_*` into the browser bundle and these are account keys.
 */

export type SenderraConfig = {
  cosmosEndpoint: string;
  cosmosKey: string;
  cosmosDatabase: string;
  cosmosContainer: string;
  storageAccount: string;
  storageKey: string;
  docsContainer: string;
  uploadRunId: string;
};

export type ConfigError = { ok: false; error: string; missing: string[] };

export function readConfig(): SenderraConfig | ConfigError {
  const get = (name: string) => process.env[name]?.trim() || "";

  const cosmosEndpoint = get("COSMOS_ENDPOINT");
  const cosmosKey = get("COSMOS_KEY");
  const storageAccount = get("AZURE_STORAGE_ACCOUNT");
  const storageKey = get("AZURE_STORAGE_KEY");

  const missing = [
    ["COSMOS_ENDPOINT", cosmosEndpoint],
    ["COSMOS_KEY", cosmosKey],
    ["AZURE_STORAGE_ACCOUNT", storageAccount],
    ["AZURE_STORAGE_KEY", storageKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name as string);

  if (missing.length > 0) {
    return {
      ok: false,
      error:
        "Senderra IDP is not configured on the server. Set the missing variables in .env.local (dev) or the Vercel project (deployed).",
      missing,
    };
  }

  if (!/^https:\/\//i.test(cosmosEndpoint)) {
    return { ok: false, error: "COSMOS_ENDPOINT must be an https URL.", missing: [] };
  }

  return {
    cosmosEndpoint,
    cosmosKey,
    cosmosDatabase: get("COSMOS_DATABASE") || "senderra-idp",
    cosmosContainer: get("COSMOS_CONTAINER") || "documents",
    storageAccount,
    storageKey,
    docsContainer: get("SENDERRA_DOCS_CONTAINER") || "docs-in",
    uploadRunId: get("SENDERRA_UPLOAD_RUN_ID") || "ui",
  };
}

export function isConfigError(value: SenderraConfig | ConfigError): value is ConfigError {
  return (value as ConfigError).ok === false;
}
