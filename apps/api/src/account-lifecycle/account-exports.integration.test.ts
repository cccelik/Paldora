import { accountExports } from '@paldora/database';
import { accountExportSchema } from '@paldora/validation';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json } from '../test-support/http.js';
import { createTestApp, type TestApp } from '../test-support/test-app.js';

let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

describe('private account exports', () => {
  it('deduplicates pending requests and only the owner can download a ready archive', async () => {
    const owner = await app.person();
    const stranger = await app.person();
    const requested = accountExportSchema.parse(
      await json(
        await app.request(owner, '/me/export', { method: 'POST' }),
        201,
      ),
    );
    expect(requested.status).toBe('pending');
    expect(
      accountExportSchema.parse(
        await json(
          await app.request(owner, '/me/export', { method: 'POST' }),
          201,
        ),
      ).id,
    ).toBe(requested.id);
    expect(
      accountExportSchema.parse(
        (
          await json<{ export: unknown }>(
            await app.request(owner, '/me/export'),
          )
        ).export,
      ).id,
    ).toBe(requested.id);
    expect(await json(await app.request(stranger, '/me/export'))).toEqual({
      export: null,
    });
    await expectError(
      await app.request(owner, `/me/export/${requested.id}/download`),
      409,
      'EXPORT_NOT_READY',
    );
    await expectError(
      await app.request(stranger, `/me/export/${requested.id}/download`),
      404,
      'EXPORT_NOT_FOUND',
    );
    await expectError(
      await app.request(owner, `/me/export/${randomUUID()}/download`),
      404,
      'EXPORT_NOT_FOUND',
    );

    const key = `exports/${requested.id}/archive.json`;
    app.storage.put(key, 'application/json', new TextEncoder().encode('{}'));
    await app.database
      .update(accountExports)
      .set({
        status: 'ready',
        objectKey: key,
        readyAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(accountExports.id, requested.id));
    const download = await json<{ url: string; expiresAt: string }>(
      await app.request(owner, `/me/export/${requested.id}/download`),
    );
    expect(download.url).toContain(encodeURIComponent(key));
    expect(new Date(download.expiresAt).getTime()).toBeGreaterThan(Date.now());
    await expectError(
      await app.request(stranger, `/me/export/${requested.id}/download`),
      404,
      'EXPORT_NOT_FOUND',
    );
  });
});
