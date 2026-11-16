/**
 * Azure Files without a storage account: the `assets` share Solutions V2
 * pushes compiled prompts and schemas to.
 *
 *   vi.mock("@azure/storage-file-share", async () => (await import("./fakes/fileShare.js")).fakeFileShareModule());
 */

class FakeShareAccount {
  /** share -> path ("prompts/x.txt", "manifest.json") -> content */
  readonly shares = new Map<string, Map<string, Buffer>>();
  readonly createdShares: string[] = [];
  readonly clients: { url: string; account: string }[] = [];

  files(share: string): string[] {
    return [...(this.shares.get(share)?.keys() ?? [])].sort();
  }

  put(share: string, file: string, content: string | Buffer = "") {
    if (!this.shares.has(share)) this.shares.set(share, new Map());
    this.shares.get(share)!.set(file, Buffer.from(content));
  }

  reset() {
    this.shares.clear();
    this.createdShares.length = 0;
    this.clients.length = 0;
  }
}

export const fakeShares = new FakeShareAccount();

export function fakeFileShareModule() {
  class StorageSharedKeyCredential {
    constructor(
      readonly accountName: string,
      readonly accountKey: string
    ) {}
  }

  const directory = (share: string, prefix: string): any => ({
    exists: async () => true,
    create: async () => ({}),
    getDirectoryClient: (name: string) => directory(share, `${prefix}${name}/`),
    getFileClient: (name: string) => {
      const key = `${prefix}${name}`;
      let pending = Buffer.alloc(0);
      return {
        exists: async () => Boolean(fakeShares.shares.get(share)?.has(key)),
        delete: async () => fakeShares.shares.get(share)?.delete(key),
        create: async (size: number) => {
          pending = Buffer.alloc(size);
          fakeShares.put(share, key, pending);
        },
        uploadRange: async (content: Buffer, offset: number) => {
          content.copy(pending, offset);
          fakeShares.put(share, key, pending);
        },
      };
    },
  });

  class ShareServiceClient {
    constructor(url: string, credential: StorageSharedKeyCredential) {
      fakeShares.clients.push({ url, account: credential.accountName });
    }
    getShareClient(share: string) {
      return {
        exists: async () => fakeShares.shares.has(share),
        create: async () => {
          fakeShares.createdShares.push(share);
          fakeShares.shares.set(share, new Map());
        },
        rootDirectoryClient: directory(share, ""),
      };
    }
  }

  return { ShareServiceClient, StorageSharedKeyCredential };
}
