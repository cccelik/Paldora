import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ObjectTooLargeError,
  type ObjectStorage,
  type SignedUpload,
  type SignedUploadRequest,
  type StoredObject,
} from './object-storage.js';

export interface S3ObjectStorageOptions {
  /** Omit for AWS; set for MinIO, R2, and other S3-compatible services. */
  readonly endpoint?: string | undefined;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
}

/** S3's DeleteObjects accepts at most 1,000 keys per call. */
const deleteBatchSize = 1_000;

const isNotFound = (error: unknown) =>
  error instanceof S3ServiceException &&
  (error.$metadata.httpStatusCode === 404 || error.name === 'NotFound');

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  public constructor(private readonly options: S3ObjectStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      // Checksums would add headers the browser cannot know in advance.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
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
      // Sign the type and length as headers so a different file fails the
      // signature check at the storage edge, before completion re-checks.
      signableHeaders: new Set(['content-type', 'content-length']),
      unhoistableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      url,
      headers: { 'content-type': request.contentType },
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1_000),
    };
  }

  public createSignedRead(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  public async inspect(objectKey: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
      );
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  public async read(objectKey: string, maxBytes: number): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
    );
    if ((result.ContentLength ?? 0) > maxBytes) {
      result.Body?.transformToWebStream()
        .cancel()
        .catch(() => undefined);
      throw new ObjectTooLargeError();
    }
    if (!result.Body) throw new Error('Stored object has no body.');
    const bytes = await result.Body.transformToByteArray();
    if (bytes.byteLength > maxBytes) throw new ObjectTooLargeError();
    return bytes;
  }

  public async write(
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

  public async delete(objectKeys: readonly string[]): Promise<void> {
    const unique = [...new Set(objectKeys)];
    for (let start = 0; start < unique.length; start += deleteBatchSize) {
      const batch = unique.slice(start, start + deleteBatchSize);
      // Sequential batches keep request volume bounded for large cleanups.
      // eslint-disable-next-line no-await-in-loop
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const failed = (result.Errors ?? []).filter(
        (error) => error.Code !== 'NoSuchKey',
      );
      if (failed.length > 0) {
        throw new Error(`Failed to delete ${failed.length} stored object(s).`);
      }
    }
  }
}
