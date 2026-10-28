import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import {
  NativeCallableSessionError,
  NativeCallableSessions,
} from './native-callable-session.js';

function fakeDb(
  read: () => Promise<{ exists?: boolean; get: (k: string) => unknown }>,
) {
  const get = vi.fn(read);
  const db = {
    collection: () => ({ doc: () => ({ get }) }),
  } as unknown as Firestore;
  return { db, get };
}

const epoch =
  (value: unknown, status: unknown = 'active') =>
  async () => ({
    exists: true,
    get: (key: string) => (key === 'status' ? status : value),
  });

describe('NativeCallableSessions', () => {
  it('accepts equal epochs and two absent epochs', async () => {
    const same = new NativeCallableSessions(fakeDb(epoch('a')).db);
    await expect(same.require('u', 'a')).resolves.toBeUndefined();
    const none = new NativeCallableSessions(fakeDb(epoch(undefined)).db);
    await expect(none.require('u', undefined)).resolves.toBeUndefined();
  });

  it('rejects a stale, missing or non-string claim', async () => {
    const sessions = new NativeCallableSessions(fakeDb(epoch('new')).db);
    await expect(sessions.require('u', 'old')).rejects.toBeInstanceOf(
      NativeCallableSessionError,
    );
    await expect(sessions.require('u', undefined)).rejects.toBeInstanceOf(
      NativeCallableSessionError,
    );
    await expect(sessions.require('u', 7)).rejects.toBeInstanceOf(
      NativeCallableSessionError,
    );
  });

  it('caches per uid until the ttl, then sees the rotation', async () => {
    let value = 'a';
    let clock = 1_000;
    const { db, get } = fakeDb(async () => ({
      exists: true,
      get: (key: string) => (key === 'status' ? 'active' : value),
    }));
    const sessions = new NativeCallableSessions(db, () => clock);
    await sessions.require('u', 'a');
    await sessions.require('u', 'a');
    expect(get).toHaveBeenCalledTimes(1);
    value = 'b';
    clock += 11_000;
    await expect(sessions.require('u', 'a')).rejects.toBeInstanceOf(
      NativeCallableSessionError,
    );
    await expect(sessions.require('u', 'b')).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the account read fails', async () => {
    const sessions = new NativeCallableSessions(
      fakeDb(async () => {
        throw new Error('unavailable');
      }).db,
    );
    await expect(sessions.require('u', undefined)).rejects.toBeInstanceOf(
      NativeCallableSessionError,
    );
  });

  it('refuses a suspended or non-active account with the same error', async () => {
    for (const status of ['suspended', 'deleting', 7]) {
      const sessions = new NativeCallableSessions(
        fakeDb(epoch('a', status)).db,
      );
      await expect(sessions.require('u', 'a')).rejects.toBeInstanceOf(
        NativeCallableSessionError,
      );
    }
  });

  it('does not refuse an account document that does not exist yet', async () => {
    const sessions = new NativeCallableSessions(
      fakeDb(async () => ({ exists: false, get: () => undefined })).db,
    );
    await expect(sessions.require('u', undefined)).resolves.toBeUndefined();
  });
});
