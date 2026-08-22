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
}
