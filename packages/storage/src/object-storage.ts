export interface SignedUploadRequest {
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expiresInSeconds: number;
}

export interface SignedUpload {
  readonly url: string;
  /** The client must send exactly these headers; the signature covers them. */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface StoredObject {
  readonly contentType: string | undefined;
  readonly contentLength: number | undefined;
}

/**
 * Private object storage. Buckets are never public: clients only ever get
 * short-lived signed URLs, and object keys never leave the server.
 */
export interface ObjectStorage {
  /** A signed PUT bound to the exact content type and byte length. */
  createSignedUpload(request: SignedUploadRequest): Promise<SignedUpload>;
  createSignedRead(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string>;
  /** Returns null when the object does not exist. */
  inspect(objectKey: string): Promise<StoredObject | null>;
  /** Reads a whole object, refusing anything larger than `maxBytes`. */
  read(objectKey: string, maxBytes: number): Promise<Uint8Array>;
  write(
    objectKey: string,
    contentType: string,
    body: Uint8Array,
  ): Promise<void>;
  /** Idempotent: deleting a missing object succeeds. */
  delete(objectKeys: readonly string[]): Promise<void>;
}

/** Thrown when a stored object exceeds the caller's size bound. */
export class ObjectTooLargeError extends Error {
  public constructor() {
    super('Stored object exceeds the allowed size.');
    this.name = 'ObjectTooLargeError';
  }
}
