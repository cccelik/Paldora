import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { S3ObjectStorage } from './index.js';

const configured = Boolean(
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY,
);

describe.runIf(configured)('S3ObjectStorage', () => {
  it('signs, verifies, and deletes a private object', async () => {
    const storage = new S3ObjectStorage({
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      region: process.env.S3_REGION ?? 'auto',
      bucket: process.env.S3_BUCKET as string,
      accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
    const objectKey = `integration/${randomUUID()}.webp`;
    const derivedKey = `${objectKey}.derived.webp`;
    const body = new Uint8Array([82, 73, 70, 70]);
    try {
      const signed = await storage.createSignedUpload({
        objectKey,
        contentType: 'image/webp',
        contentLength: body.byteLength,
        expiresInSeconds: 60,
      });
      const response = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.headers,
        body,
      });
      expect(response.ok).toBe(true);
      expect(await storage.inspectObject(objectKey)).toEqual({
        contentType: 'image/webp',
        contentLength: body.byteLength,
      });
      expect(await storage.readObject(objectKey)).toEqual(body);
      await storage.writeObject(derivedKey, 'image/webp', body);
      expect(await storage.inspectObject(derivedKey)).toEqual({
        contentType: 'image/webp',
        contentLength: body.byteLength,
      });
    } finally {
      await Promise.all([
        storage.deleteObject(objectKey),
        storage.deleteObject(derivedKey),
      ]);
    }
    expect(await storage.inspectObject(objectKey)).toBeNull();
  });
});
