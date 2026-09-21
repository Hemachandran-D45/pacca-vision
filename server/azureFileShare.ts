import fs from "node:fs";
import path from "node:path";
import { ShareServiceClient, StorageSharedKeyCredential } from "@azure/storage-file-share";

export type FileShareUploadResult = {
  ok: boolean;
  uploadedFiles: string[];
  error?: string;
};

export async function uploadAssetsToFileShare(assetsDir: string): Promise<FileShareUploadResult> {
  const account = process.env.AZURE_STORAGE_ACCOUNT || "paccavisionsa";
  const key = process.env.AZURE_STORAGE_KEY || "ZgHHhvyBvCfyQ8bVmNOCoI9m+llaULJB63DhsfDkVgc5kPfT+HA20+TUt+35yx9ufx2Oo7QYpmFH+ASt9I1v8A==";
  const shareName = process.env.AZURE_FILES_SHARE_NAME || "assets";

  if (!account || !key) {
    return {
      ok: false,
      uploadedFiles: [],
      error: "Azure Storage credentials not configured.",
    };
  }

  const credential = new StorageSharedKeyCredential(account, key);
  const serviceClient = new ShareServiceClient(`https://${account}.file.core.windows.net`, credential);
  const shareClient = serviceClient.getShareClient(shareName);

  const shareExists = await shareClient.exists();
  if (!shareExists) {
    await shareClient.create();
  }

  const uploadedFiles: string[] = [];

  // Helper to upload a single file
  async function uploadFileToDir(dirClient: any, fileName: string, filePath: string) {
    const content = fs.readFileSync(filePath);
    const fileClient = dirClient.getFileClient(fileName);
    await fileClient.create(content.length);
    await fileClient.uploadRange(content, 0, content.length);
    uploadedFiles.push(fileName);
  }

  try {
    const rootDirClient = shareClient.rootDirectoryClient;

    // 1. Upload root files in assetsDir (e.g. type_catalog.txt, field_meta.json, manifest.json, gap_routing.json)
    const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(assetsDir, entry.name);
        await uploadFileToDir(rootDirClient, entry.name, filePath);
      }
    }

    // 2. Upload subdirectories (prompts, schemas)
    for (const subDirName of ["prompts", "schemas"]) {
      const subDirPath = path.join(assetsDir, subDirName);
      if (fs.existsSync(subDirPath)) {
        const subDirClient = rootDirClient.getDirectoryClient(subDirName);
        const subDirExists = await subDirClient.exists();
        if (!subDirExists) {
          await subDirClient.create();
        }

        const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (subEntry.isFile()) {
            const filePath = path.join(subDirPath, subEntry.name);
            await uploadFileToDir(subDirClient, subEntry.name, filePath);
          }
        }
      }
    }

    return { ok: true, uploadedFiles };
  } catch (err: any) {
    console.error("Failed to upload assets to Azure File Share:", err);
    return {
      ok: false,
      uploadedFiles,
      error: err?.message || String(err),
    };
  }
}
