import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { accountExports, type PaldoraDatabase } from '@paldora/database';
import type { ObjectStorage } from '@paldora/storage';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DATABASE, OBJECT_STORAGE } from '../platform/config/tokens.js';
import { defineError } from '../platform/http/api-error.js';

const exportNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'EXPORT_NOT_FOUND',
  'This export was not found.',
);
const exportNotReady = defineError(
  HttpStatus.CONFLICT,
  'EXPORT_NOT_READY',
  'This export is not ready for download.',
);

const view = (row: typeof accountExports.$inferSelect) => ({
  id: row.id,
  status:
    row.status === 'ready' && row.expiresAt && row.expiresAt <= new Date()
      ? 'expired'
      : row.status,
  createdAt: row.createdAt.toISOString(),
  readyAt: row.readyAt?.toISOString() ?? null,
  expiresAt: row.expiresAt?.toISOString() ?? null,
});

@Injectable()
export class AccountExportsService {
  public constructor(
    @Inject(DATABASE) private readonly db: PaldoraDatabase,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  public async request(userId: string) {
    const id = randomUUID();
    await this.db
      .insert(accountExports)
      .values({ id, userId, objectKey: `exports/${id}/archive.json` })
      .onConflictDoNothing();
    const [row] = await this.db
      .select()
      .from(accountExports)
      .where(
        and(
          eq(accountExports.userId, userId),
          eq(accountExports.status, 'pending'),
        ),
      )
      .limit(1);
    if (!row) throw exportNotReady();
    return view(row);
  }

  public async latest(userId: string) {
    const [row] = await this.db
      .select()
      .from(accountExports)
      .where(eq(accountExports.userId, userId))
      .orderBy(desc(accountExports.createdAt), desc(accountExports.id))
      .limit(1);
    return { export: row ? view(row) : null };
  }

  public async download(userId: string, exportId: string) {
    const [row] = await this.db
      .select()
      .from(accountExports)
      .where(
        and(eq(accountExports.id, exportId), eq(accountExports.userId, userId)),
      )
      .limit(1);
    if (!row) throw exportNotFound();
    if (
      row.status !== 'ready' ||
      !row.objectKey ||
      !row.expiresAt ||
      row.expiresAt <= new Date()
    )
      throw exportNotReady();
    const ttlSeconds = 60;
    const url = await this.storage.createSignedRead(row.objectKey, ttlSeconds);
    return {
      url,
      expiresAt: new Date(Date.now() + ttlSeconds * 1_000).toISOString(),
    };
  }
}
