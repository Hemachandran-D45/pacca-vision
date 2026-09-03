import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import type { SenderraConfig } from "./config";

const SAFE = /[^A-Za-z0-9\-_.]/g;

/**
 * `Prior Auth (1).pdf` -> `Prior_Auth_1.pdf`.
 *
 * The document id is derived from this path by `parse_ocr_message` and then
 * reused as a path segment in three more containers, so characters that are
 * legal in a filename but awkward in a path are folded to underscores.
 *
 * ⚠️ The run of underscores is then COLLAPSED, and that is not cosmetic. The
 * pipeline stores documents under `safe_doc_id`, which encodes `/` as `__` and
 * decodes it back the same way. A filename containing a literal `__` would
 * therefore be read back as a document id containing a `/`, pointing stage 2 at
 * a work prefix that does not exist. Collapsing here means an uploaded name can
 * never round-trip into a different document id.
 */
export function safeBlobName(filename: string): string {
  let stem = filename.replace(SAFE, "_");
  while (stem.includes("__")) stem = stem.replace(/__/g, "_");
  if (!stem.toLowerCase().endsWith(".pdf")) stem += ".pdf";
  return stem;
}

function credential(config: SenderraConfig) {
  return new StorageSharedKeyCredential(config.storageAccount, config.storageKey);
}

function sasUrl(
  config: SenderraConfig,
  containerName: string,
  blobName: string,
  permissions: string,
  minutes: number
): string {
  const cred = credential(config);
  // Backdated so a few minutes of clock skew between Vercel and Azure cannot
  // produce a token that is not yet valid.
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + minutes * 60 * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn,
      expiresOn,
      contentType: "application/pdf",
    },
    cred
  ).toString();

  const encoded = blobName.split("/").map(encodeURIComponent).join("/");
  return `https://${config.storageAccount}.blob.core.windows.net/${containerName}/${encoded}?${sas}`;
}

/**
 * A write-only, single-blob, 15-minute SAS the browser PUTs directly to.
 *
 * The file never passes through our API, which is not an optimisation: Vercel
 * caps a serverless request body at 4.5 MB and a 50-page scanned fax is well
 * past that. Direct-to-blob is also what starts the pipeline — the write to
 * `docs-in` is the Event Grid trigger, so there is no enqueue call to make.
 */
export function mintUploadSas(config: SenderraConfig, runId: string, filename: string) {
  const name = safeBlobName(filename);
  const blobName = `${runId}/${name}`;
  return {
    blobName,
    documentId: `${runId}/${name.replace(/\.pdf$/i, "")}`,
    container: config.docsContainer,
    uploadUrl: sasUrl(config, config.docsContainer, blobName, "cw", 15),
    expiresInSeconds: 15 * 60,
  };
}

/** A read-only SAS so pdf.js can render the source document in the reviewer. */
export function mintReadSas(config: SenderraConfig, containerAndBlob: string, minutes = 30) {
  const cut = containerAndBlob.indexOf("/");
  const containerName = cut < 0 ? config.docsContainer : containerAndBlob.slice(0, cut);
  const blobName = cut < 0 ? containerAndBlob : containerAndBlob.slice(cut + 1);
  return sasUrl(config, containerName, blobName, "r", minutes);
}

/**
 * Documents that have landed in `docs-in` but produced no Cosmos record yet.
 *
 * Between the blob write and the first `ocr` item there is a real window —
 * Event Grid delivery, queue wait, then CU itself — during which a freshly
 * uploaded document exists but is invisible to any Cosmos query. Listing the
 * container closes that gap so an upload appears as Queued immediately instead
 * of vanishing for half a minute.
 */
export async function listRecentUploads(config: SenderraConfig, runIdPrefix?: string) {
  const service = BlobServiceClient.fromConnectionString(
    `DefaultEndpointsProtocol=https;AccountName=${config.storageAccount};AccountKey=${config.storageKey};EndpointSuffix=core.windows.net`
  );
  const client = service.getContainerClient(config.docsContainer);
  const out: { documentId: string; blobPath: string; size: number; uploadedAt: string | null }[] = [];
  for await (const blob of client.listBlobsFlat({ prefix: runIdPrefix })) {
    if (!blob.name.toLowerCase().endsWith(".pdf")) continue;
    const stem = blob.name.replace(/\.pdf$/i, "");
    out.push({
      documentId: stem.includes("/") ? stem : `prod/${stem}`,
      blobPath: `${config.docsContainer}/${blob.name}`,
      size: blob.properties.contentLength ?? 0,
      uploadedAt: blob.properties.createdOn?.toISOString() ?? null,
    });
  }
  return out;
}
