import {
  ObjectTooLargeError,
  type ObjectStorage,
  type SignedUpload,
  type SignedUploadRequest,
  type StoredObject,
} from './object-storage.js';

interface MemoryObject {
  readonly contentType: string;
  readonly body: Uint8Array;
}

/**
 * Test double with the same contract as S3. Signed URLs use a fake origin and
 * are never fetched; tests place uploads directly with `put`. `failNext`
 * injects storage outages for fault tests.
 */
export class MemoryObjectStorage implements ObjectStorage {
  public readonly objects = new Map<string, MemoryObject>();
  private failures = 0;

  /** Makes the next `count` storage calls throw, as an outage would. */
  public failNext(count = 1): void {
    this.failures = count;
  }

  /** Simulates a client completing a signed PUT. */
  public put(objectKey: string, contentType: string, body: Uint8Array): void {
    this.objects.set(objectKey, { contentType, body });
  }

  public async createSignedUpload(
    request: SignedUploadRequest,
  ): Promise<SignedUpload> {
    this.maybeFail();
    return {
      url: `https://storage.test/upload/${encodeURIComponent(request.objectKey)}?signature=fake`,
      headers: { 'content-type': request.contentType },
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1_000),
    };
  }

  public async createSignedRead(objectKey: string): Promise<string> {
    this.maybeFail();
    return `https://storage.test/read/${encodeURIComponent(objectKey)}?signature=fake`;
  }

  public async inspect(objectKey: string): Promise<StoredObject | null> {
    this.maybeFail();
    const object = this.objects.get(objectKey);
    return object
      ? {
          contentType: object.contentType,
          contentLength: object.body.byteLength,
        }
      : null;
  }

  public async read(objectKey: string, maxBytes: number): Promise<Uint8Array> {
    this.maybeFail();
    const object = this.objects.get(objectKey);
    if (!object) throw new Error('NoSuchKey');
    if (object.body.byteLength > maxBytes) throw new ObjectTooLargeError();
    return object.body;
  }

  public async write(
    objectKey: string,
    contentType: string,
    body: Uint8Array,
  ): Promise<void> {
    this.maybeFail();
    this.objects.set(objectKey, { contentType, body });
  }

  public async delete(objectKeys: readonly string[]): Promise<void> {
    this.maybeFail();
    for (const key of objectKeys) this.objects.delete(key);
  }

  private maybeFail(): void {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('storage unavailable');
    }
  }
}
