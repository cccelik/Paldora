import { requireEnvironmentVariables } from '@paldora/config';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { ObjectTooLargeError } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

const environment = requireEnvironmentVariables(
  [
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ],
  process.env,
);
const storage = new S3ObjectStorage({
  endpoint: environment.S3_ENDPOINT,
  region: environment.S3_REGION ?? 'us-east-1',
  bucket: environment.S3_BUCKET ?? '',
  accessKeyId: environment.S3_ACCESS_KEY_ID ?? '',
  secretAccessKey: environment.S3_SECRET_ACCESS_KEY ?? '',
  forcePathStyle: true,
});
const prefix = `integration/${randomUUID()}`;
const created: string[] = [];
const keyFor = (name: string) => {
  const key = `${prefix}/${name}`;
  created.push(key);
  return key;
};
const body: Uint8Array<ArrayBuffer> = new Uint8Array([
  82, 73, 70, 70, 1, 2, 3, 4,
]);

afterAll(() => storage.delete(created));

async function signedPut(
  key: string,
  init: { type?: string; data?: Uint8Array<ArrayBuffer> } = {},
) {
  const signed = await storage.createSignedUpload({
    objectKey: key,
    contentType: 'image/webp',
    contentLength: body.byteLength,
    expiresInSeconds: 60,
  });
  return fetch(signed.url, {
    method: 'PUT',
    headers: { ...signed.headers, 'content-type': init.type ?? 'image/webp' },
    body: init.data ?? body,
  });
}

describe('S3ObjectStorage against real S3-compatible storage', () => {
  it('accepts a signed upload that matches the reservation', async () => {
    const key = keyFor('ok.webp');
    expect((await signedPut(key)).ok).toBe(true);
    await expect(storage.inspect(key)).resolves.toEqual({
      contentType: 'image/webp',
      contentLength: body.byteLength,
    });
    await expect(storage.read(key, 1_024)).resolves.toEqual(body);
  });

  it('rejects a signed upload with a different content type', async () => {
    const key = keyFor('wrong-type.webp');
    expect((await signedPut(key, { type: 'image/svg+xml' })).ok).toBe(false);
    await expect(storage.inspect(key)).resolves.toBeNull();
  });

  it('rejects a signed upload with a different length', async () => {
    const key = keyFor('wrong-length.webp');
    const response = await signedPut(key, { data: new Uint8Array(64) });
    expect(response.ok).toBe(false);
    await expect(storage.inspect(key)).resolves.toBeNull();
  });

  it('refuses to read objects beyond the size bound', async () => {
    const key = keyFor('big.bin');
    await storage.write(key, 'application/octet-stream', new Uint8Array(32));
    await expect(storage.read(key, 16)).rejects.toBeInstanceOf(
      ObjectTooLargeError,
    );
  });

  it('deletes idempotently, including missing keys', async () => {
    const key = keyFor('delete-me.webp');
    await storage.write(key, 'image/webp', body);
    await storage.delete([key, `${prefix}/never-existed`]);
    await storage.delete([key]);
    await expect(storage.inspect(key)).resolves.toBeNull();
  });

  it('signs reads that expire', async () => {
    const key = keyFor('read.webp');
    await storage.write(key, 'image/webp', body);
    const url = await storage.createSignedRead(key, 60);
    expect(url).toContain('X-Amz-Expires=60');
    const response = await fetch(url);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
  });
});
