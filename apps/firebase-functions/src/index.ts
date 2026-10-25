import {
  NativeBoxInvitations,
  NativeInvitationError,
  NativeBoxPosts,
  NativeBoxMembers,
  NativeBoxMemberError,
  NativeBoxDeletion,
  NativeBoxDeletionError,
  NativeBlockPairs,
  NativeBlockError,
  NativePostError,
  NativeRateLimitError,
  NativeRateLimits,
  NativeModeration,
  NativeModerationError,
  NativeNotifications,
  NativeAccounts,
  NativeAccountLifecycle,
  NativeAccountError,
  NativeFriendships,
  NativeFriendshipError,
  NativeHomeFeed,
  NativeLifeUpdates,
  NativeLifeUpdateError,
  NativeMedia,
  NativeUsernameError,
  NativeUsernames,
} from '@paldora/firebase-trusted';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFunctions } from 'firebase-admin/functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const invitations = new NativeBoxInvitations(db);
const posts = new NativeBoxPosts(db);
const members = new NativeBoxMembers(db);
const blocks = new NativeBlockPairs(db);
const usernames = new NativeUsernames(db);
const rateLimits = new NativeRateLimits(db);
const moderation = new NativeModeration(db);
const notifications = new NativeNotifications(db);
const accounts = new NativeAccounts(db, getAuth());
const accountLifecycle = new NativeAccountLifecycle(
  db,
  getAuth(),
  getStorage(),
  process.env.FIREBASE_STORAGE_BUCKET ??
    `${process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT}.firebasestorage.app`,
);
const friendships = new NativeFriendships(db);
const boxDeletion = new NativeBoxDeletion(
  db,
  async (path) => {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ??
      (process.env.GCLOUD_PROJECT
        ? `${process.env.GCLOUD_PROJECT}.firebasestorage.app`
        : null);
    if (!bucketName)
      throw new Error('Private Storage bucket is not configured.');
    await getStorage()
      .bucket(bucketName)
      .file(path)
      .delete({ ignoreNotFound: true });
  },
  async (id) => {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ??
      `${process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT}.firebasestorage.app`;
    await new NativeMedia(db, getStorage(), bucketName).retire(id);
  },
);
const lifeUpdates = new NativeLifeUpdates(db);
const homeFeed = new NativeHomeFeed(db);
const media = new NativeMedia(
  db,
  getStorage(),
  process.env.FIREBASE_STORAGE_BUCKET ??
    `${process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT}.firebasestorage.app`,
);
const options = { region: 'europe-west4', maxInstances: 1 } as const;

export const repairAccountLifecycle = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  async () => {
    const results = await Promise.allSettled([
      accountLifecycle.repairExports(),
      accountLifecycle.repairDeletions(),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  },
);

/** A retryable local worker; hosted scheduling waits for the Blaze decision. */
export const repairBoxDeletionJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  async () => {
    await boxDeletion.repairPending();
  },
);

/** New intents start immediately; the scheduled pass repairs interrupted work. */
export const projectFeedJob = onDocumentCreated(
  { document: 'nativeJobs/{jobId}', region: 'europe-west4', maxInstances: 1 },
  async (event) => {
    if (event.data?.get('type') !== 'feed') return;
    for (let page = 0; page < 100; page += 1) {
      // eslint-disable-next-line no-await-in-loop -- One job cursor must advance in order.
      if ((await homeFeed.processOnce(event.params.jobId)) === 'complete')
        break;
    }
  },
);

export const repairFeedJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  async () => {
    await homeFeed.processPending(100);
  },
);

/** The canonical transaction writes activity first; projection can be retried. */
export const projectNotification = onDocumentCreated(
  {
    document: 'nativeActivity/{activityId}',
    region: 'europe-west4',
    maxInstances: 1,
  },
  async (event) => {
    await notifications.processOnce(event.params.activityId);
  },
);

export const repairNotificationProjection = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  async () => {
    await notifications.processPending(100);
  },
);

export const redactModerationEvidence = onSchedule(
  { schedule: 'every 24 hours', region: 'europe-west4', maxInstances: 1 },
  async () => {
    await moderation.redactClosedReports();
  },
);

/** Firestore is the durable intent; a task only carries its opaque job ID. */
export const dispatchMediaJob = onDocumentCreated(
  { document: 'nativeJobs/{jobId}', region: 'europe-west4', maxInstances: 1 },
  async (event) => {
    if (event.data?.get('type') !== 'media') return;
    if (
      process.env.FUNCTIONS_EMULATOR === 'true' &&
      process.env.GCLOUD_PROJECT === 'demo-paldora'
    ) {
      // The task emulator can stall while Admin resolves local credentials.
      // The same durable intent and lease code still runs in the demo project.
      await media.processOnce(event.params.jobId);
      return;
    }
    await getFunctions()
      .taskQueue<{ jobId: string }>(
        'locations/europe-west4/functions/executeMediaJob',
      )
      .enqueue({ jobId: event.params.jobId });
  },
);

export const executeMediaJob = onTaskDispatched<{ jobId: string }>(
  {
    region: 'europe-west4',
    maxInstances: 1,
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 10 },
  },
  async (request) => {
    if (
      typeof request.data.jobId !== 'string' ||
      !request.data.jobId.startsWith('media-')
    )
      return;
    await media.processOnce(request.data.jobId);
  },
);

export const repairMediaJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  async () => {
    await media.repairPending(100);
    await media.repairPostCleanups(100);
    await media.expireUnattached(100);
  },
);

async function drainPostMedia(postId: string): Promise<void> {
  for (let page = 0; page < 100; page += 1) {
    // eslint-disable-next-line no-await-in-loop -- Each page retires one bounded set before the next.
    const status = await media.cleanupPost(`media-post-cleanup-${postId}`);
    if (status === 'complete') return;
  }
  throw new Error('Post media cleanup remains pending.');
}

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return uid;
}

function field(data: unknown, key: string, maxLength = 128): string {
  const value =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== 'string' || !value || value.length > maxLength)
    throw new HttpsError('invalid-argument', `Invalid ${key}.`);
  return value;
}

function invitationError(error: NativeInvitationError): HttpsError {
  if (error.code === 'FORBIDDEN')
    return new HttpsError('permission-denied', 'Action unavailable.');
  if (error.code === 'ALREADY_MEMBER' || error.code === 'ALREADY_PENDING')
    return new HttpsError('already-exists', 'Action unavailable.');
  if (error.code === 'EXPIRED')
    return new HttpsError('failed-precondition', 'Invitation expired.');
  return new HttpsError('not-found', 'Action unavailable.');
}

function moderationError(error: NativeModerationError): HttpsError {
  if (error.code === 'INVALID')
    return new HttpsError('invalid-argument', 'Invalid report.');
  if (error.code === 'FORBIDDEN')
    return new HttpsError('permission-denied', 'Action unavailable.');
  return new HttpsError('not-found', 'Action unavailable.');
}

function friendshipError(error: NativeFriendshipError): HttpsError {
  if (error.code === 'ALREADY_EXISTS')
    return new HttpsError('already-exists', 'Request unavailable.');
  if (error.code === 'FORBIDDEN')
    return new HttpsError('permission-denied', 'Action unavailable.');
  return new HttpsError('not-found', 'Action unavailable.');
}

function contentError(
  error: NativePostError | NativeLifeUpdateError,
): HttpsError {
  if (error.code === 'INVALID')
    return new HttpsError('invalid-argument', 'Invalid content.');
  return new HttpsError('not-found', 'Content unavailable.');
}

function boxError(
  error: NativeBoxMemberError | NativeBoxDeletionError,
): HttpsError {
  if (error instanceof NativeBoxDeletionError) {
    if (error.code === 'INVALID')
      return new HttpsError('invalid-argument', 'Confirmation does not match.');
    if (error.code === 'DEPENDENCY_PENDING')
      return new HttpsError('failed-precondition', 'Box cleanup is waiting.');
  }
  return new HttpsError('not-found', 'Box unavailable.');
}

function usernameError(error: NativeUsernameError): HttpsError {
  return error.code === 'TAKEN'
    ? new HttpsError('already-exists', 'Username unavailable.')
    : new HttpsError('failed-precondition', 'Username unavailable.');
}

async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof NativeInvitationError) throw invitationError(error);
    if (error instanceof NativeUsernameError) throw usernameError(error);
    if (
      error instanceof NativePostError ||
      error instanceof NativeLifeUpdateError
    )
      throw contentError(error);
    if (error instanceof NativeBlockError) {
      if (error.code === 'INVALID')
        throw new HttpsError('invalid-argument', 'Invalid block target.');
      throw new HttpsError('failed-precondition', 'Account unavailable.');
    }
    if (error instanceof NativeRateLimitError)
      throw new HttpsError('resource-exhausted', 'Try again later.');
    if (error instanceof NativeModerationError) throw moderationError(error);
    if (error instanceof NativeAccountError)
      throw new HttpsError('failed-precondition', 'Account unavailable.');
    if (error instanceof NativeFriendshipError) throw friendshipError(error);
    if (
      error instanceof NativeBoxMemberError ||
      error instanceof NativeBoxDeletionError
    )
      throw boxError(error);
    throw error;
  }
}

function limited<T>(
  uid: string,
  scope: string,
  limit: number,
  work: () => Promise<T>,
): Promise<T> {
  return invoke(async () => {
    await rateLimits.consume(uid, scope, limit, 60 * 60 * 1_000);
    return work();
  });
}

export const beginBoxDeletion = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const confirmName = field(request.data, 'confirmName', 80);
  return limited(uid, 'beginBoxDeletion', 5, async () => ({
    jobId: await boxDeletion.start(boxId, uid, confirmName),
  }));
});

export const boxDeletionStatus = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  return limited(uid, 'boxDeletionStatus', 120, () =>
    boxDeletion.status(boxId, uid),
  );
});

export const createLifeUpdate = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return limited(uid, 'createLifeUpdate', 30, async () => ({
    id: await lifeUpdates.create(uid, request.data),
  }));
});

export const getLifeUpdate = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const id = field(request.data, 'id', 36);
  return limited(uid, 'getLifeUpdate', 600, () => lifeUpdates.get(id, uid));
});

export const listMyLifeUpdates = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const data = request.data as Record<string, unknown> | null;
  const cursor =
    data?.cursor === undefined ? undefined : field(data, 'cursor', 36);
  return limited(uid, 'listMyLifeUpdates', 600, () =>
    lifeUpdates.listMine(uid, cursor),
  );
});

export const editLifeUpdate = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const id = field(request.data, 'id', 36);
  const changes =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).changes
      : undefined;
  return limited(uid, 'editLifeUpdate', 60, async () => {
    const removed = await lifeUpdates.edit(id, uid, changes);
    await Promise.all(removed.map((mediaId) => media.retire(mediaId)));
    return { ok: true };
  });
});

export const deleteLifeUpdate = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const id = field(request.data, 'id', 36);
  return limited(uid, 'deleteLifeUpdate', 30, async () => {
    const current = await lifeUpdates.get(id, uid);
    const removed = await lifeUpdates.remove(id, uid);
    await Promise.all(removed.map((mediaId) => media.retire(mediaId)));
    await Promise.all(
      current.contexts.map((context) => drainPostMedia(context.postId)),
    );
    return { ok: true };
  });
});

export const inviteBox = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const username = field(request.data, 'username', 30);
  return limited(uid, 'inviteBox', 60, async () => ({
    invitationId: await invitations.inviteByUsername(boxId, uid, username),
  }));
});

export const provisionMyAccount = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return limited(uid, 'provisionMyAccount', 10, async () => {
    await accounts.provision(uid);
    return { ok: true };
  });
});

export const sendFriendRequest = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const username = field(request.data, 'username', 30);
  return limited(uid, 'sendFriendRequest', 60, async () => ({
    requestId: await friendships.sendByUsername(uid, username),
  }));
});

export const acceptFriendRequest = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const requestId = field(request.data, 'requestId', 64);
  return limited(uid, 'acceptFriendRequest', 120, async () => {
    await friendships.accept(requestId, uid);
    return { ok: true };
  });
});

export const closeFriendship = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const requestId = field(request.data, 'requestId', 64);
  return limited(uid, 'closeFriendship', 120, async () => {
    await friendships.close(requestId, uid);
    return { ok: true };
  });
});

export const listMyFriendships = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const data = request.data as Record<string, unknown>;
  const status = data.status;
  if (status !== 'pending' && status !== 'sent' && status !== 'accepted')
    throw new HttpsError('invalid-argument', 'Invalid friendship status.');
  const cursor =
    data.cursor === undefined ? undefined : field(data, 'cursor', 64);
  return limited(uid, 'listMyFriendships', 600, () =>
    friendships.list(uid, status, cursor),
  );
});

export const listMyBoxInvitations = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const cursor =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9]{64}$/.test(cursor))
  )
    throw new HttpsError('invalid-argument', 'Invalid cursor.');
  return limited(uid, 'listMyBoxInvitations', 600, () =>
    invitations.listPending(uid, cursor),
  );
});

export const listBoxInvitations = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const raw = request.data as Record<string, unknown>;
  const cursor =
    raw.cursor === undefined ? undefined : field(raw, 'cursor', 64);
  return limited(uid, 'listBoxInvitations', 600, () =>
    invitations.listForBox(boxId, uid, cursor),
  );
});

export const listBoxMembers = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const raw = request.data as Record<string, unknown>;
  const cursor = raw.cursor === undefined ? undefined : field(raw, 'cursor');
  return limited(uid, 'listBoxMembers', 600, () =>
    members.list(boxId, uid, cursor),
  );
});

export const acceptBoxInvitation = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const invitationId = field(request.data, 'invitationId', 64);
  return limited(uid, 'acceptBoxInvitation', 120, async () => ({
    boxId: await invitations.accept(invitationId, uid),
  }));
});

export const declineBoxInvitation = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const invitationId = field(request.data, 'invitationId', 64);
  return limited(uid, 'declineBoxInvitation', 120, async () => {
    await invitations.decline(invitationId, uid);
    return { ok: true };
  });
});

export const revokeBoxInvitation = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const invitationId = field(request.data, 'invitationId', 64);
  const boxId = field(request.data, 'boxId');
  return limited(uid, 'revokeBoxInvitation', 120, async () => {
    await invitations.revoke(invitationId, boxId, uid);
    return { ok: true };
  });
});

export const reserveUsername = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const username = field(request.data, 'username', 30);
  return limited(uid, 'reserveUsername', 30, async () => ({
    normalized: await usernames.reserve(uid, username),
  }));
});

export const createBoxPost = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const text = field(request.data, 'text', 5_000);
  return limited(uid, 'createBoxPost', 120, async () => ({
    postId: await posts.create(boxId, uid, text),
  }));
});

export const getBoxPost = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return limited(uid, 'getBoxPost', 1200, () =>
    posts.get(
      field(request.data, 'boxId'),
      field(request.data, 'postId', 64),
      uid,
    ),
  );
});

export const listBoxPosts = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const cursor =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor))
  )
    throw new HttpsError('invalid-argument', 'Invalid cursor.');
  return limited(uid, 'listBoxPosts', 600, () =>
    posts.list(boxId, uid, cursor),
  );
});

export const editBoxPost = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return limited(uid, 'editBoxPost', 240, async () => {
    await posts.edit(
      field(request.data, 'boxId'),
      field(request.data, 'postId', 64),
      uid,
      field(request.data, 'text', 5_000),
    );
    return { ok: true };
  });
});

export const deleteBoxPost = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return limited(uid, 'deleteBoxPost', 240, async () => {
    const postId = field(request.data, 'postId', 64);
    const removed = await posts.remove(
      field(request.data, 'boxId'),
      postId,
      uid,
    );
    await Promise.all(removed.map((mediaId) => media.retire(mediaId)));
    await drainPostMedia(postId);
    return { ok: true };
  });
});

export const setUserBlock = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const targetUid = field(request.data, 'targetUid');
  const blocked =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).blocked
      : undefined;
  if (typeof blocked !== 'boolean')
    throw new HttpsError('invalid-argument', 'Invalid block state.');
  return limited(uid, 'setUserBlock', 120, async () => {
    await blocks.setBlocked(uid, targetUid, blocked);
    return { ok: true };
  });
});

export const createBoxComment = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const text = field(request.data, 'text', 2_000);
  const parentId =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).parentId
      : undefined;
  if (
    parentId !== undefined &&
    parentId !== null &&
    (typeof parentId !== 'string' || !/^[a-f0-9-]{36}$/.test(parentId))
  )
    throw new HttpsError('invalid-argument', 'Invalid parent.');
  return limited(uid, 'createBoxComment', 240, async () => ({
    commentId: await posts.createComment(
      boxId,
      postId,
      uid,
      text,
      parentId ?? null,
    ),
  }));
});

export const listBoxComments = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const cursor =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor))
  )
    throw new HttpsError('invalid-argument', 'Invalid cursor.');
  return limited(uid, 'listBoxComments', 600, () =>
    posts.listComments(boxId, postId, uid, cursor),
  );
});

export const editBoxComment = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return limited(uid, 'editBoxComment', 240, async () => {
    await posts.editComment(
      field(request.data, 'boxId'),
      field(request.data, 'postId', 64),
      field(request.data, 'commentId', 64),
      uid,
      field(request.data, 'text', 2_000),
    );
    return { ok: true };
  });
});

export const deleteBoxComment = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  return limited(uid, 'deleteBoxComment', 240, async () => {
    await posts.deleteComment(
      field(request.data, 'boxId'),
      field(request.data, 'postId', 64),
      field(request.data, 'commentId', 64),
      uid,
    );
    return { ok: true };
  });
});

export const setBoxReaction = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const data = request.data as Record<string, unknown>;
  const commentId =
    data.commentId === undefined ? undefined : field(data, 'commentId', 64);
  const mediaAssetId =
    data.mediaAssetId === undefined
      ? undefined
      : field(data, 'mediaAssetId', 64);
  const kind = data.kind;
  if (kind !== null && typeof kind !== 'string')
    throw new HttpsError('invalid-argument', 'Invalid reaction.');
  return limited(uid, 'setBoxReaction', 600, async () => {
    const previous = await posts.setReaction(boxId, postId, uid, kind, {
      ...(commentId ? { commentId } : {}),
      ...(mediaAssetId ? { mediaAssetId } : {}),
    });
    if (previous) await media.retire(previous);
    return { ok: true };
  });
});

export const listBoxReactions = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const data = request.data as Record<string, unknown>;
  const commentId =
    data.commentId === undefined ? undefined : field(data, 'commentId', 64);
  const cursor = data.cursor === undefined ? undefined : field(data, 'cursor');
  return limited(uid, 'listBoxReactions', 600, () =>
    posts.listReactions(boxId, postId, uid, commentId, cursor).then((page) => ({
      ...page,
      items: page.items.map(({ uid: reactorUid, kind }) => ({
        uid: reactorUid,
        kind,
      })),
    })),
  );
});

export const reportBoxPost = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const reason = field(request.data, 'reason', 2_000);
  return limited(uid, 'reportBoxPost', 20, async () => ({
    reportId: await moderation.reportPost(boxId, postId, uid, reason),
  }));
});

export const listModerationReports = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const cursor =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor))
  )
    throw new HttpsError('invalid-argument', 'Invalid cursor.');
  return limited(uid, 'listModerationReports', 600, () =>
    moderation.listReports(uid, cursor),
  );
});

export const hideReportedPost = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const reportId = field(request.data, 'reportId', 64);
  return limited(uid, 'hideReportedPost', 120, async () => {
    const postId = await moderation.hideReportedPost(reportId, uid);
    await drainPostMedia(postId);
    return { ok: true };
  });
});
