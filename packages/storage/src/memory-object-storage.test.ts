import { describe, expect, it } from 'vitest';
import { MemoryObjectStorage } from './memory-object-storage.js';
import { ObjectTooLargeError } from './object-storage.js';

/** The fake must keep the contract the S3 adapter's integration test proves. */
describe('MemoryObjectStorage', () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);

  it('reports stored type and length, and null for missing objects', async () => {
    const storage = new MemoryObjectStorage();
    storage.put('a', 'image/png', bytes);
    await expect(storage.inspect('a')).resolves.toEqual({
      contentType: 'image/png',
      contentLength: 4,
    });
    await expect(storage.inspect('missing')).resolves.toBeNull();
  });

  it('enforces the read size bound', async () => {
    const storage = new MemoryObjectStorage();
    await storage.write('a', 'image/webp', bytes);
    await expect(storage.read('a', 4)).resolves.toEqual(bytes);
    await expect(storage.read('a', 3)).rejects.toBeInstanceOf(
      ObjectTooLargeError,
    );
  });

  it('deletes idempotently', async () => {
    const storage = new MemoryObjectStorage();
    storage.put('a', 'image/png', bytes);
    await storage.delete(['a', 'never-existed']);
    await storage.delete(['a']);
    expect(storage.objects.size).toBe(0);
  });

  it('injects the requested number of outages', async () => {
    const storage = new MemoryObjectStorage();
    storage.failNext(2);
    await expect(storage.inspect('a')).rejects.toThrow(/unavailable/);
    await expect(storage.createSignedRead('a')).rejects.toThrow(/unavailable/);
    await expect(storage.inspect('a')).resolves.toBeNull();
  });
});
