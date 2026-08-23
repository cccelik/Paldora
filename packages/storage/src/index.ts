import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface SignedUploadRequest {
  objectKey: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

export interface SignedUpload {
  url: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: Date;
}

export interface ObjectStorage {
  createSignedUpload(request: SignedUploadRequest): Promise<SignedUpload>;
  createSignedDownload(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
  inspectObject(objectKey: string): Promise<StoredObject | null>;
  readObject(objectKey: string): Promise<Uint8Array>;
  writeObject(
    objectKey: string,
    contentType: string,
    body: Uint8Array,
  ): Promise<void>;
}

export interface StoredObject {
  contentType: string | undefined;
  contentLength: number | undefined;
}

export interface S3ObjectStorageOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  public constructor(private readonly options: S3ObjectStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  public async createSignedUpload(
    request: SignedUploadRequest,
  ): Promise<SignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: request.objectKey,
      ContentType: request.contentType,
      ContentLength: request.contentLength,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: request.expiresInSeconds,
    });
    return {
      url,
      headers: { 'content-type': request.contentType },
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000),
    };
  }

  public createSignedDownload(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  public async inspectObject(objectKey: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
      );
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  public async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
    );
  }

  public async readObject(objectKey: string): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new Error('Stored object has no body.');
    return result.Body.transformToByteArray();
  }

  public async writeObject(
    objectKey: string,
    contentType: string,
    body: Uint8Array,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: body.byteLength,
        Body: body,
      }),
    );
  }
}
