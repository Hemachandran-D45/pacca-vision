import fs from "node:fs";
import path from "node:path";
import { ShareServiceClient, StorageSharedKeyCredential } from "@azure/storage-file-share";

export type FileShareUploadResult = {
  ok: boolean;
  uploadedFiles: string[];
  deletedFiles?: string[];
  error?: string;
};

function getClient() {
  const account = process.env.AZURE_STORAGE_ACCOUNT || "paccavisionsa";
  const key = process.env.AZURE_STORAGE_KEY || "ZgHHhvyBvCfyQ8bVmNOCoI9m+llaULJB63DhsfDkVgc5kPfT+HA20+TUt+35yx9ufx2Oo7QYpmFH+ASt9I1v8A==";
  const shareName = process.env.AZURE_FILES_SHARE_NAME || "assets";

  if (!account || !key) {
    throw new Error("Azure Storage credentials not configured.");
  }

  const credential = new StorageSharedKeyCredential(account, key);
  const serviceClient = new ShareServiceClient(`https://${account}.file.core.windows.net`, credential);
  return serviceClient.getShareClient(shareName);
}

export async function deleteTypeFromFileShare(typeKey: string): Promise<{ ok: boolean; deletedFiles: string[]; error?: string }> {
  const deletedFiles: string[] = [];
  try {
    const shareClient = getClient();
    const rootDirClient = shareClient.rootDirectoryClient;

    // 1. Delete prompt file from prompts/
    try {
      const promptsDirClient = rootDirClient.getDirectoryClient("prompts");
      const promptFileClient = promptsDirClient.getFileClient(`${typeKey}.txt`);
      const exists = await promptFileClient.exists();
      if (exists) {
        await promptFileClient.delete();
        deletedFiles.push(`prompts/${typeKey}.txt`);
      }
    } catch (err) {
      console.warn(`Could not delete prompts/${typeKey}.txt:`, err);
    }

    // 2. Delete schema file from schemas/
    try {
      const schemasDirClient = rootDirClient.getDirectoryClient("schemas");
      const schemaFileClient = schemasDirClient.getFileClient(`${typeKey}.json`);
      const exists = await schemaFileClient.exists();
      if (exists) {
        await schemaFileClient.delete();
        deletedFiles.push(`schemas/${typeKey}.json`);
      }
    } catch (err) {
      console.warn(`Could not delete schemas/${typeKey}.json:`, err);
    }

    return { ok: true, deletedFiles };
  } catch (err: any) {
    console.error("Failed to delete type files from Azure File Share:", err);
    return { ok: false, deletedFiles, error: err?.message || String(err) };
  }
}

export async function uploadAssetsToFileShare(assetsDir: string): Promise<FileShareUploadResult> {
  const account = process.env.AZURE_STORAGE_ACCOUNT || "paccavisionsa";
  const key = process.env.AZURE_STORAGE_KEY || "ZgHHhvyBvCfyQ8bVmNOCoI9m+llaULJB63DhsfDkVgc5kPfT+HA20+TUt+35yx9ufx2Oo7QYpmFH+ASt9I1v8A==";

  if (!account || !key) {
    return {
      ok: false,
      uploadedFiles: [],
      error: "Azure Storage credentials not configured.",
    };
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
    const shareClient = getClient();
    const shareExists = await shareClient.exists();
    if (!shareExists) {
      await shareClient.create();
    }

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
