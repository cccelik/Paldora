import {
  accountExports,
  commentReactions,
  comments,
  lifeUpdates,
  mediaAssets,
  postReactions,
  posts,
  profiles,
  roomCustomizations,
  roomCustomWidgets,
  rooms,
  roomTopFriends,
  roomWidgets,
  userPreferences,
  users,
  type DatabaseExecutor,
  type PaldoraDatabase,
} from '@paldora/database';
import type { ObjectStorage } from '@paldora/storage';
import { and, eq, lt } from 'drizzle-orm';

const archiveTtlMs = 7 * 24 * 60 * 60 * 1_000;

/** Only the person's own rows and explicitly chosen settings; no object keys. */
export async function archiveFor(executor: DatabaseExecutor, userId: string) {
  const [account] = await executor
    .select({ id: users.id, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!account) return null;
  const [
    profile,
    preferences,
    ownPosts,
    ownComments,
    reactions,
    commentVotes,
    updates,
    room,
    widgets,
    topFriends,
    customizations,
    customWidgets,
    media,
  ] = await Promise.all([
    executor.select().from(profiles).where(eq(profiles.userId, userId)),
    executor
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId)),
    executor.select().from(posts).where(eq(posts.authorUserId, userId)),
    executor.select().from(comments).where(eq(comments.authorUserId, userId)),
    executor
      .select()
      .from(postReactions)
      .where(eq(postReactions.userId, userId)),
    executor
      .select()
      .from(commentReactions)
      .where(eq(commentReactions.userId, userId)),
    executor
      .select()
      .from(lifeUpdates)
      .where(eq(lifeUpdates.authorUserId, userId)),
    executor.select().from(rooms).where(eq(rooms.userId, userId)),
    executor
      .select()
      .from(roomWidgets)
      .where(eq(roomWidgets.roomUserId, userId)),
    executor
      .select()
      .from(roomTopFriends)
      .where(eq(roomTopFriends.roomUserId, userId)),
    executor
      .select()
      .from(roomCustomizations)
      .where(eq(roomCustomizations.roomUserId, userId)),
    executor
      .select()
      .from(roomCustomWidgets)
      .where(eq(roomCustomWidgets.roomUserId, userId)),
    executor
      .select({
        id: mediaAssets.id,
        purpose: mediaAssets.purpose,
        boxId: mediaAssets.boxId,
        status: mediaAssets.status,
        contentType: mediaAssets.contentType,
        contentLength: mediaAssets.contentLength,
        width: mediaAssets.width,
        height: mediaAssets.height,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.ownerUserId, userId)),
  ]);
  return {
    format: 'paldora-json-v1',
    account,
    profile: profile[0] ?? null,
    preferences: preferences[0] ?? null,
    posts: ownPosts,
    comments: ownComments,
    postReactions: reactions,
    commentReactions: commentVotes,
    lifeUpdates: updates,
    room: room[0] ?? null,
    roomWidgets: widgets,
    roomTopFriends: topFriends,
    roomCustomizations: customizations,
    roomCustomWidgets: customWidgets,
    media,
  };
}

/** A retry overwrites the same private object; only a committed ready row can be downloaded. */
export async function buildNextExport(
  database: PaldoraDatabase,
  storage: ObjectStorage,
  now = new Date(),
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountExports)
      .where(eq(accountExports.status, 'pending'))
      .orderBy(accountExports.createdAt, accountExports.id)
      .for('update', { skipLocked: true })
      .limit(1);
    if (!request) return false;
    const archive = await archiveFor(tx, request.userId);
    if (!archive) return false;
    if (!request.objectKey)
      throw new Error('Pending export has no object key.');
    const objectKey = request.objectKey;
    await storage.write(
      objectKey,
      'application/json',
      new TextEncoder().encode(JSON.stringify(archive)),
    );
    await tx
      .update(accountExports)
      .set({
        status: 'ready',
        objectKey,
        readyAt: now,
        expiresAt: new Date(now.getTime() + archiveTtlMs),
      })
      .where(eq(accountExports.id, request.id));
    return true;
  });
}

export async function expireNextExport(
  database: PaldoraDatabase,
  storage: ObjectStorage,
  now = new Date(),
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountExports)
      .where(
        and(
          eq(accountExports.status, 'ready'),
          lt(accountExports.expiresAt, now),
        ),
      )
      .orderBy(accountExports.expiresAt, accountExports.id)
      .for('update', { skipLocked: true })
      .limit(1);
    if (!request?.objectKey) return false;
    await storage.delete([request.objectKey]);
    await tx
      .update(accountExports)
      .set({
        status: 'expired',
        objectKey: null,
        readyAt: null,
        expiresAt: null,
      })
      .where(eq(accountExports.id, request.id));
    return true;
  });
}
