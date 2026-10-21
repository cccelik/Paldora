import {
  accountDeletionRequests,
  accountExports,
  boxMemberships,
  mediaAssets,
  postReactions,
  rooms,
  storedObjectKeys,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { ObjectStorage } from '@paldora/storage';
import { and, eq, inArray, lte } from 'drizzle-orm';

export interface AuthAccountDeleter {
  deleteUser(subject: string): Promise<void>;
}

/** Freeze API access before external deletion; a crash leaves a retryable blocked account. */
export async function startNextDueErasure(
  database: PaldoraDatabase,
  now = new Date(),
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletionRequests)
      .where(
        and(
          inArray(accountDeletionRequests.status, ['pending', 'blocked']),
          lte(accountDeletionRequests.nextAttemptAt, now),
        ),
      )
      .orderBy(
        accountDeletionRequests.nextAttemptAt,
        accountDeletionRequests.id,
      )
      .for('update', { skipLocked: true })
      .limit(1);
    if (!request?.userId) return false;
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, request.userId))
      .for('update');
    if (!user) return false;
    const [owned] = await tx
      .select({ boxId: boxMemberships.boxId })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.userId, user.id),
          eq(boxMemberships.role, 'owner'),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (owned) {
      await tx
        .update(accountDeletionRequests)
        .set({
          status: 'blocked',
          nextAttemptAt: new Date(now.getTime() + 15 * 60_000),
        })
        .where(eq(accountDeletionRequests.id, request.id));
      return true;
    }
    // Before freezing, let signed uploads expire and in-flight processors
    // finish. New ownership and uploads have been barred since request time.
    const [unfinished] = await tx
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.ownerUserId, user.id),
          inArray(mediaAssets.status, ['pending', 'processing']),
        ),
      )
      .limit(1);
    if (unfinished) {
      await tx
        .update(accountDeletionRequests)
        .set({ nextAttemptAt: new Date(now.getTime() + 15 * 60_000) })
        .where(eq(accountDeletionRequests.id, request.id));
      return true;
    }
    await tx
      .update(users)
      .set({ status: 'deleted', updatedAt: now })
      .where(eq(users.id, user.id));
    await tx
      .update(accountDeletionRequests)
      .set({ status: 'erasing' })
      .where(eq(accountDeletionRequests.id, request.id));
    return true;
  });
}

/** Delete private objects, Auth, and database rows; every step is safe to retry. */
export async function finishNextErasure(
  database: PaldoraDatabase,
  storage: ObjectStorage,
  auth: AuthAccountDeleter,
  now = new Date(),
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.status, 'erasing'))
      .orderBy(accountDeletionRequests.dueAt, accountDeletionRequests.id)
      .for('update', { skipLocked: true })
      .limit(1);
    if (!request?.userId) return false;
    const [user] = await tx
      .select({
        id: users.id,
        subject: users.authSubject,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, request.userId))
      .for('update');
    if (!user || user.status !== 'deleted')
      throw new Error('Erasure request has no blocked account.');
    const assets = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.ownerUserId, user.id))
      .for('update');
    const exports = await tx
      .select({ objectKey: accountExports.objectKey })
      .from(accountExports)
      .where(eq(accountExports.userId, user.id))
      .for('update');
    await storage.delete([
      ...assets.flatMap(storedObjectKeys),
      ...exports.flatMap(({ objectKey }) => (objectKey ? [objectKey] : [])),
    ]);
    await tx
      .update(rooms)
      .set({ bannerMediaId: null })
      .where(eq(rooms.userId, user.id));
    if (assets.length > 0) {
      await tx.delete(postReactions).where(
        inArray(
          postReactions.mediaAssetId,
          assets.map((asset) => asset.id),
        ),
      );
      await tx.delete(mediaAssets).where(eq(mediaAssets.ownerUserId, user.id));
    }
    await auth.deleteUser(user.subject);
    await tx
      .update(accountDeletionRequests)
      .set({ status: 'completed', completedAt: now })
      .where(eq(accountDeletionRequests.id, request.id));
    await tx.delete(users).where(eq(users.id, user.id));
    return true;
  });
}
