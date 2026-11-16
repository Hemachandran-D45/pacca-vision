import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IStorageAdapter, StorageUploadGrant, CloudProvider } from "../types.js";

export type AwsStorageConfig = {
  region: string;
  bucketName: string;
  accessKeyId?: string;
  secretAccessKey?: string;
};

export class AwsS3StorageAdapter implements IStorageAdapter {
  public provider: CloudProvider = "aws";
  private s3: S3Client;
  private bucket: string;

  constructor(config: AwsStorageConfig) {
    this.bucket = config.bucketName;
    const clientConfig: any = { region: config.region };
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    this.s3 = new S3Client(clientConfig);
  }

  async mintUploadUrl(filename: string, contentType: string, runId = "prod"): Promise<StorageUploadGrant> {
    const cleanName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const fileKey = `${runId}/${Date.now()}-${cleanName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: contentType,
    });

    const expiresInSeconds = 900; // 15 minutes
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });

    return {
      uploadUrl,
      fileKey,
      expiresInSeconds,
      headers: {
        "Content-Type": contentType,
      },
    };
  }

  async mintReadUrl(fileKey: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  async readBuffer(fileKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });
    const response = await this.s3.send(command);
    if (!response.Body) throw new Error(`Empty body returned for S3 object: ${fileKey}`);
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  async deleteFile(fileKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });
    await this.s3.send(command);
  }
}
