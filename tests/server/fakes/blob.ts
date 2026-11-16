/**
 * Blob Storage without a storage account.
 *
 * SAS minting is pure HMAC and needs no network, so tests keep the real
 * `@azure/storage-blob` for it and replace only `BlobServiceClient`: the
 * docs-in listing (`listRecentUploads`) and the `schemas` container
 * (`schemaLoader.ts`).
 *
 *   vi.mock("@azure/storage-blob", async (orig) => ({
 *     ...(await orig<object>()),
 *     ...(await import("./fakes/blob.js")).fakeBlobModule(),
 *   }));
 */
import { Readable } from "node:stream";

type FakeBlob = { name: string; contentLength: number; createdOn: Date; content: Buffer; contentType?: string };

class FakeBlobAccount {
  private containers = new Map<string, FakeBlob[]>();
  private failListing = false;
  readonly connectionStrings: string[] = [];
  readonly createdContainers: string[] = [];

  /** A blob as the browser's PUT (or anything else) would have left it. */
  add(container: string, name: string, options: { size?: number; createdOn?: string; content?: string | Buffer; contentType?: string } = {}) {
    const content = options.content === undefined ? Buffer.alloc(0) : Buffer.from(options.content);
    const list = (this.containers.get(container) ?? []).filter((b) => b.name !== name);
    list.push({
      name,
      contentLength: options.size ?? (content.length || 1024),
      createdOn: new Date(options.createdOn ?? "2026-10-01T10:00:00Z"),
      content,
      contentType: options.contentType,
    });
    this.containers.set(container, list);
  }

  get(container: string, name: string): FakeBlob | undefined {
    return this.containers.get(container)?.find((b) => b.name === name);
  }

  names(container: string): string[] {
    return (this.containers.get(container) ?? []).map((b) => b.name).sort();
  }

  /** Make every listing throw until reset, like a storage outage. */
  failListings() {
    this.failListing = true;
  }

  list(container: string, prefix = ""): FakeBlob[] {
    if (this.failListing) throw new Error("fake blob: injected listing failure");
    return (this.containers.get(container) ?? []).filter((b) => b.name.startsWith(prefix));
  }

  reset() {
    this.containers.clear();
    this.failListing = false;
    this.connectionStrings.length = 0;
    this.createdContainers.length = 0;
  }
}

export const fakeBlobs = new FakeBlobAccount();

export function fakeBlobModule() {
  class BlobServiceClient {
    constructor(readonly url?: string, readonly credential?: unknown) {}

    static fromConnectionString(connectionString: string) {
      fakeBlobs.connectionStrings.push(connectionString);
      return new BlobServiceClient();
    }

    getContainerClient(container: string) {
      const blobClient = (name: string) => ({
        exists: async () => Boolean(fakeBlobs.get(container, name)),
        download: async () => {
          const blob = fakeBlobs.get(container, name);
          if (!blob) throw Object.assign(new Error("fake blob: BlobNotFound"), { statusCode: 404 });
          return { readableStreamBody: Readable.from([blob.content]) };
        },
      });
      return {
        async *listBlobsFlat(options: { prefix?: string } = {}) {
          for (const blob of fakeBlobs.list(container, options.prefix)) {
            yield { name: blob.name, properties: { contentLength: blob.contentLength, createdOn: blob.createdOn } };
          }
        },
        createIfNotExists: async () => {
          fakeBlobs.createdContainers.push(container);
          return { succeeded: true };
        },
        getBlobClient: blobClient,
        getBlockBlobClient: (name: string) => ({
          ...blobClient(name),
          upload: async (content: string | Buffer, _length: number, options: { blobHTTPHeaders?: { blobContentType?: string } } = {}) => {
            fakeBlobs.add(container, name, { content, contentType: options.blobHTTPHeaders?.blobContentType });
            return {};
          },
        }),
      };
    }
  }
  return { BlobServiceClient };
}
