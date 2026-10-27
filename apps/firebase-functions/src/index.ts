import {
  NativeBoxInvitations,
  NativeBoxes,
  NativeBoxError,
  NativeProfiles,
  NativeProfileError,
  NativeNotificationError,
  NativeHomeFeedError,
  NativeCallableSessionError,
  NativeCallableSessions,
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
  NativeLifecycleError,
  NativeWebSessions,
  NativeWebSessionError,
  NativeFriendships,
  NativeFriendshipError,
  NativeHomeFeed,
  NativeInteractionIndex,
  NativeLifeUpdates,
  NativeLifeUpdateError,
  NativeMedia,
  NativeMediaError,
  NativeMemories,
  NativeMemoryError,
  NativeRoomError,
  NativeRooms,
  compactMemoryCursor,
  expandMemoryCursor,
  type NativeMemoryFilter,
  type NativeMemoryScope,
  NativeUsernameError,
  NativeUsernames,
  logEvent,
  readyAvatarMediaId,
} from '@paldora/firebase-trusted';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFunctions } from 'firebase-admin/functions';
import {
  HttpsError,
  onCall,
  onRequest,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import type { CallableName } from './callable-names.js';
import { observedJob } from './observed.js';
import { boxView, NativeViews } from './native-views.js';
import {
  commentItemView,
  commentThreadView,
  pinnedCommentThread,
} from './native-comment-views.js';
import { handleMediaRead, handleMediaUpload } from './media-http.js';
import { isoVersion, roomPhotos, roomView } from './native-room-views.js';
import { native } from '@paldora/validation';
import { handleAccountExportDownload } from './account-export-http.js';

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const invitations = new NativeBoxInvitations(db);
const posts = new NativeBoxPosts(db);
const members = new NativeBoxMembers(db);
const blocks = new NativeBlockPairs(db);
const usernames = new NativeUsernames(db);
const rateLimits = new NativeRateLimits(db);
const callableSessions = new NativeCallableSessions(db);
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
const rooms = new NativeRooms(db);
const memories = new NativeMemories(db);
const boxes = new NativeBoxes(db);
const profiles = new NativeProfiles(db, getAuth());
const interactionIndex = new NativeInteractionIndex(db);
const media = new NativeMedia(
  db,
  getStorage(),
  process.env.FIREBASE_STORAGE_BUCKET ??
    `${process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT}.firebasestorage.app`,
);
const options = { region: 'europe-west4', maxInstances: 1 } as const;

export const repairAccountLifecycle = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  observedJob('repairAccountLifecycle', async () => {
    const results = await Promise.allSettled([
      accountLifecycle.repairExports(),
      accountLifecycle.repairDeletions(),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }),
);

/** A retryable local worker; hosted scheduling waits for the Blaze decision. */
export const repairBoxDeletionJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  observedJob('repairBoxDeletionJobs', async () => {
    await boxDeletion.repairPending();
  }),
);

/** New intents start immediately; the scheduled pass repairs interrupted work. */
export const projectFeedJob = onDocumentCreated(
  { document: 'nativeJobs/{jobId}', region: 'europe-west4', maxInstances: 1 },
  observedJob(
    'projectFeedJob',
    async (event) => {
      if (event.data?.get('type') !== 'feed') return;
      for (let page = 0; page < 100; page += 1) {
        // eslint-disable-next-line no-await-in-loop -- One job cursor must advance in order.
        if ((await homeFeed.processOnce(event.params.jobId)) === 'complete')
          break;
      }
    },
    (event) => event.params.jobId,
  ),
);

export const repairFeedJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  observedJob('repairFeedJobs', async () => {
    await homeFeed.processPending(100);
  }),
);

/** Repairs a post's interaction index; the job is a durable hint, never authority. */
export const projectInteractionIndexJob = onDocumentCreated(
  { document: 'nativeJobs/{jobId}', region: 'europe-west4', maxInstances: 1 },
  observedJob(
    'projectInteractionIndexJob',
    async (event) => {
      if (event.data?.get('type') !== 'interactionIndexRepair') return;
      await interactionIndex.processOnce(event.params.jobId);
    },
    (event) => event.params.jobId,
  ),
);

export const repairInteractionIndexJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  observedJob('repairInteractionIndexJobs', async () => {
    await interactionIndex.processPending(100);
  }),
);

/** The canonical transaction writes activity first; projection can be retried. */
export const projectNotification = onDocumentCreated(
  {
    document: 'nativeActivity/{activityId}',
    region: 'europe-west4',
    maxInstances: 1,
  },
  observedJob(
    'projectNotification',
    async (event) => {
      await notifications.processOnce(event.params.activityId);
    },
    (event) => event.params.activityId,
  ),
);

export const repairNotificationProjection = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  observedJob('repairNotificationProjection', async () => {
    await notifications.processPending(100);
  }),
);

export const redactModerationEvidence = onSchedule(
  { schedule: 'every 24 hours', region: 'europe-west4', maxInstances: 1 },
  observedJob('redactModerationEvidence', async () => {
    await moderation.redactClosedReports();
  }),
);

/** Firestore is the durable intent; a task only carries its opaque job ID. */
export const dispatchMediaJob = onDocumentCreated(
  { document: 'nativeJobs/{jobId}', region: 'europe-west4', maxInstances: 1 },
  observedJob(
    'dispatchMediaJob',
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
    (event) => event.params.jobId,
  ),
);

export const executeMediaJob = onTaskDispatched<{ jobId: string }>(
  {
    region: 'europe-west4',
    maxInstances: 1,
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 10 },
  },
  observedJob(
    'executeMediaJob',
    async (request) => {
      if (
        typeof request.data.jobId !== 'string' ||
        !request.data.jobId.startsWith('media-')
      )
        return;
      await media.processOnce(request.data.jobId);
    },
    (request) => request.data.jobId,
  ),
);

export const repairMediaJobs = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west4', maxInstances: 1 },
  observedJob('repairMediaJobs', async () => {
    await media.repairPending(100);
    await media.repairPostCleanups(100);
    await media.expireUnattached(100);
  }),
);

async function drainPostMedia(postId: string): Promise<void> {
  for (let page = 0; page < 100; page += 1) {
    // eslint-disable-next-line no-await-in-loop -- Each page retires one bounded set before the next.
    const status = await media.cleanupPost(`media-post-cleanup-${postId}`);
    if (status === 'complete') return;
  }
  throw new Error('Post media cleanup remains pending.');
}

type NativeErrorReason = native.NativeErrorReason;

/** ADR 021 decision 7: a stable, non-leaking reason beside the code. */
function reasoned(
  code: ConstructorParameters<typeof HttpsError>[0],
  message: string,
  reason: NativeErrorReason,
): HttpsError {
  return new HttpsError(code, message, { reason });
}

/** ADR 021 #5: an ID token from before a session-epoch rotation is refused. */
async function requireSession(
  auth: { uid: string; token: Record<string, unknown> } | undefined,
): Promise<string> {
  if (!auth?.uid)
    throw reasoned('unauthenticated', 'Sign in required.', 'SIGN_IN_REQUIRED');
  try {
    await callableSessions.require(auth.uid, auth.token.paldoraSessionEpoch);
  } catch (error) {
    if (error instanceof NativeCallableSessionError)
      throw reasoned('unauthenticated', 'Sign in required.', 'SESSION_ENDED');
    throw error;
  }
  return auth.uid;
}

function field(data: unknown, key: string, maxLength = 128): string {
  const value =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== 'string' || !value || value.length > maxLength)
    throw reasoned('invalid-argument', `Invalid ${key}.`, 'INVALID_INPUT');
  return value;
}

function optionalIds(value: unknown, max: number): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((id) => typeof id !== 'string' || !id || id.length > 64)
  )
    throw reasoned('invalid-argument', 'Invalid media.', 'INVALID_INPUT');
  return value as string[];
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
    return reasoned('invalid-argument', 'Invalid report.', 'INVALID_INPUT');
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
    return reasoned('invalid-argument', 'Invalid content.', 'INVALID_INPUT');
  return new HttpsError('not-found', 'Content unavailable.');
}

function boxError(
  error: NativeBoxMemberError | NativeBoxDeletionError,
): HttpsError {
  if (error instanceof NativeBoxDeletionError) {
    if (error.code === 'INVALID')
      return reasoned(
        'invalid-argument',
        'Confirmation does not match.',
        'INVALID_INPUT',
      );
    if (error.code === 'DEPENDENCY_PENDING')
      return new HttpsError('failed-precondition', 'Box cleanup is waiting.');
  }
  return new HttpsError('not-found', 'Box unavailable.');
}

/** Absence and denial share `not-found`; the rest only ever reach the owner. */
function mediaError(error: NativeMediaError): HttpsError {
  if (error.code === 'INVALID')
    return reasoned('invalid-argument', 'Invalid media.', 'INVALID_INPUT');
  if (error.code === 'UNAVAILABLE')
    return new HttpsError('not-found', 'Media unavailable.');
  return new HttpsError('failed-precondition', 'Media unavailable.');
}

/** Absence, a hidden Room and a block share `not-found`; a stale save is told apart. */
function roomError(error: NativeRoomError): HttpsError {
  if (error.code === 'UNAVAILABLE')
    return new HttpsError('not-found', 'Room unavailable.');
  if (error.code === 'INVALID')
    return reasoned(
      'invalid-argument',
      'Check your Room settings.',
      'INVALID_INPUT',
    );
  if (error.code === 'STALE')
    return reasoned('failed-precondition', 'Reload your Room.', 'STALE_WRITE');
  if (error.code === 'FRIEND_INELIGIBLE')
    return new HttpsError('failed-precondition', 'Choose from your friends.');
  return new HttpsError('failed-precondition', 'Banner unavailable.');
}

function memoryError(error: NativeMemoryError): HttpsError {
  if (error.code === 'INVALID')
    return reasoned(
      'invalid-argument',
      'Invalid memory page.',
      'INVALID_INPUT',
    );
  return new HttpsError('not-found', 'Memories unavailable.');
}

function usernameError(error: NativeUsernameError): HttpsError {
  return error.code === 'TAKEN'
    ? new HttpsError('already-exists', 'Username unavailable.')
    : new HttpsError('failed-precondition', 'Username unavailable.');
}

function profileError(error: NativeProfileError): HttpsError {
  if (error.code === 'INVALID')
    return reasoned('invalid-argument', 'Invalid profile.', 'INVALID_INPUT');
  if (error.code === 'TAKEN')
    return new HttpsError('already-exists', 'Username unavailable.');
  return new HttpsError('failed-precondition', 'Account unavailable.');
}

/** Absence and denial share one code; only malformed input is told apart. */
function readError(
  error: NativeBoxError | NativeNotificationError | NativeHomeFeedError,
): HttpsError {
  if (error.code === 'INVALID')
    return reasoned('invalid-argument', 'Invalid request.', 'INVALID_INPUT');
  return new HttpsError('not-found', 'Unavailable.');
}

/**
 * Password, session and deletion failures. A wrong or unusable password and
 * every other session failure share `permission-denied`: the client never
 * learns which factor failed. Ownership and window rules mirror the web copy.
 */
function accountSafetyError(error: unknown): HttpsError | null {
  if (error instanceof NativeWebSessionError)
    return new HttpsError('permission-denied', 'Action unavailable.');
  if (!(error instanceof NativeLifecycleError)) return null;
  if (error.code === 'REAUTH_FAILED')
    return new HttpsError('permission-denied', 'Action unavailable.');
  if (error.code === 'UNAVAILABLE')
    return new HttpsError('not-found', 'Action unavailable.');
  return new HttpsError('failed-precondition', 'Action unavailable.');
}

function accountReadError(error: unknown): HttpsError | null {
  const safety = accountSafetyError(error);
  if (safety) return safety;
  if (error instanceof NativeProfileError) return profileError(error);
  if (error instanceof NativeMediaError) return mediaError(error);
  if (error instanceof NativeAccountError)
    return new HttpsError('failed-precondition', 'Account unavailable.');
  if (error instanceof NativeRoomError) return roomError(error);
  if (error instanceof NativeMemoryError) return memoryError(error);
  if (
    error instanceof NativeBoxError ||
    error instanceof NativeNotificationError ||
    error instanceof NativeHomeFeedError
  )
    return readError(error);
  return null;
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
        throw reasoned(
          'invalid-argument',
          'Invalid block target.',
          'INVALID_INPUT',
        );
      throw new HttpsError('failed-precondition', 'Account unavailable.');
    }
    if (error instanceof NativeRateLimitError)
      throw reasoned('resource-exhausted', 'Try again later.', 'RATE_LIMITED');
    if (error instanceof NativeModerationError) throw moderationError(error);
    if (error instanceof NativeFriendshipError) throw friendshipError(error);
    if (
      error instanceof NativeBoxMemberError ||
      error instanceof NativeBoxDeletionError
    )
      throw boxError(error);
    const mapped = accountReadError(error);
    if (mapped) throw mapped;
    logEvent('ERROR', { event: 'callable.failed' }, error);
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
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const confirmName = field(request.data, 'confirmName', 80);
  return limited(uid, 'beginBoxDeletion', 5, async () => ({
    jobId: await boxDeletion.start(boxId, uid, confirmName),
  }));
});

export const boxDeletionStatus = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  return limited(uid, 'boxDeletionStatus', 120, () =>
    boxDeletion.status(boxId, uid),
  );
});

export const createLifeUpdate = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'createLifeUpdate', 30, async () => ({
    id: await lifeUpdates.create(uid, request.data),
  }));
});

export const getLifeUpdate = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const id = field(request.data, 'id', 36);
  return limited(uid, 'getLifeUpdate', 600, () => lifeUpdates.get(id, uid));
});

export const listMyLifeUpdates = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const data = request.data as Record<string, unknown> | null;
  const cursor =
    data?.cursor === undefined ? undefined : field(data, 'cursor', 36);
  return limited(uid, 'listMyLifeUpdates', 600, () =>
    lifeUpdates.listMine(uid, cursor),
  );
});

export const editLifeUpdate = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
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
  const uid = await requireSession(request.auth);
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
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const username = field(request.data, 'username', 30);
  return limited(uid, 'inviteBox', 60, async () => ({
    invitationId: await invitations.inviteByUsername(boxId, uid, username),
  }));
});

export const provisionMyAccount = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'provisionMyAccount', 10, async () => {
    await accounts.provision(uid);
    return { ok: true };
  });
});

export const sendFriendRequest = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const username = field(request.data, 'username', 30);
  return limited(uid, 'sendFriendRequest', 60, async () => ({
    requestId: await friendships.sendByUsername(uid, username),
  }));
});

export const acceptFriendRequest = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const requestId = field(request.data, 'requestId', 64);
  return limited(uid, 'acceptFriendRequest', 120, async () => {
    await friendships.accept(requestId, uid);
    return { ok: true };
  });
});

export const closeFriendship = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const requestId = field(request.data, 'requestId', 64);
  return limited(uid, 'closeFriendship', 120, async () => {
    await friendships.close(requestId, uid);
    return { ok: true };
  });
});

export const listMyFriendships = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const data = request.data as Record<string, unknown>;
  const status = data.status;
  if (status !== 'pending' && status !== 'sent' && status !== 'accepted')
    throw reasoned(
      'invalid-argument',
      'Invalid friendship status.',
      'INVALID_INPUT',
    );
  const cursor =
    data.cursor === undefined ? undefined : field(data, 'cursor', 64);
  return limited(uid, 'listMyFriendships', 600, () =>
    friendships.list(uid, status, cursor),
  );
});

export const listMyBoxInvitations = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const cursor =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9]{64}$/.test(cursor))
  )
    throw reasoned('invalid-argument', 'Invalid cursor.', 'INVALID_INPUT');
  return limited(uid, 'listMyBoxInvitations', 600, () =>
    invitations.listPending(uid, cursor),
  );
});

export const listBoxInvitations = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const raw = request.data as Record<string, unknown>;
  const cursor =
    raw.cursor === undefined ? undefined : field(raw, 'cursor', 64);
  return limited(uid, 'listBoxInvitations', 600, () =>
    invitations.listForBox(boxId, uid, cursor),
  );
});

export const listBoxMembers = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const raw = request.data as Record<string, unknown>;
  const cursor = raw.cursor === undefined ? undefined : field(raw, 'cursor');
  return limited(uid, 'listBoxMembers', 600, () =>
    members.list(boxId, uid, cursor),
  );
});

export const acceptBoxInvitation = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const invitationId = field(request.data, 'invitationId', 64);
  return limited(uid, 'acceptBoxInvitation', 120, async () => ({
    boxId: await invitations.accept(invitationId, uid),
  }));
});

export const declineBoxInvitation = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const invitationId = field(request.data, 'invitationId', 64);
  return limited(uid, 'declineBoxInvitation', 120, async () => {
    await invitations.decline(invitationId, uid);
    return { ok: true };
  });
});

export const revokeBoxInvitation = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const invitationId = field(request.data, 'invitationId', 64);
  const boxId = field(request.data, 'boxId');
  return limited(uid, 'revokeBoxInvitation', 120, async () => {
    await invitations.revoke(invitationId, boxId, uid);
    return { ok: true };
  });
});

export const reserveUsername = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const username = field(request.data, 'username', 30);
  return limited(uid, 'reserveUsername', 30, async () => ({
    normalized: await usernames.reserve(uid, username),
  }));
});

export const createBoxPost = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const data = request.data as Record<string, unknown>;
  // Empty text is allowed only with photos; the service enforces the rule.
  const text = typeof data.text === 'string' ? data.text : '';
  const mediaAssetIds = optionalIds(data.mediaAssetIds, 4);
  return limited(uid, 'createBoxPost', 120, async () => ({
    postId: await posts.create(boxId, uid, text, Date.now(), mediaAssetIds),
  }));
});

export const getBoxPost = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'getBoxPost', 1200, () =>
    posts.get(
      field(request.data, 'boxId'),
      field(request.data, 'postId', 64),
      uid,
    ),
  );
});

export const listBoxPosts = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const cursor =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor))
  )
    throw reasoned('invalid-argument', 'Invalid cursor.', 'INVALID_INPUT');
  return limited(uid, 'listBoxPosts', 600, () =>
    posts.list(boxId, uid, cursor),
  );
});

export const editBoxPost = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
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
  const uid = await requireSession(request.auth);
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
  const uid = await requireSession(request.auth);
  const targetUid = field(request.data, 'targetUid');
  const blocked =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).blocked
      : undefined;
  if (typeof blocked !== 'boolean')
    throw reasoned('invalid-argument', 'Invalid block state.', 'INVALID_INPUT');
  return limited(uid, 'setUserBlock', 120, async () => {
    await blocks.setBlocked(uid, targetUid, blocked);
    return { ok: true };
  });
});

export const listMyBlocks = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const raw = request.data as Record<string, unknown>;
  const cursor =
    raw.cursor === undefined ? undefined : field(raw, 'cursor', 128);
  return limited(uid, 'listMyBlocks', 600, () => blocks.list(uid, cursor));
});

export const createBoxComment = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
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
    throw reasoned('invalid-argument', 'Invalid parent.', 'INVALID_INPUT');
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
  const uid = await requireSession(request.auth);
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
    throw reasoned('invalid-argument', 'Invalid cursor.', 'INVALID_INPUT');
  return limited(uid, 'listBoxComments', 600, () =>
    posts.listComments(boxId, postId, uid, cursor),
  );
});

export const editBoxComment = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
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
  const uid = await requireSession(request.auth);
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
  const uid = await requireSession(request.auth);
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
    throw reasoned('invalid-argument', 'Invalid reaction.', 'INVALID_INPUT');
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
  const uid = await requireSession(request.auth);
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
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const reason = field(request.data, 'reason', 2_000);
  return limited(uid, 'reportBoxPost', 20, async () => ({
    reportId: await moderation.reportPost(boxId, postId, uid, reason),
  }));
});

export const listModerationReports = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const cursor =
    request.data && typeof request.data === 'object'
      ? (request.data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor))
  )
    throw reasoned('invalid-argument', 'Invalid cursor.', 'INVALID_INPUT');
  return limited(uid, 'listModerationReports', 600, () =>
    moderation.listReports(uid, cursor),
  );
});

export const hideReportedPost = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const reportId = field(request.data, 'reportId', 64);
  return limited(uid, 'hideReportedPost', 120, async () => {
    const postId = await moderation.hideReportedPost(reportId, uid);
    await drainPostMedia(postId);
    return { ok: true };
  });
});

function optionalCursor(data: unknown): string | undefined {
  const raw =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>).cursor
      : undefined;
  if (raw === undefined) return undefined;
  return field({ cursor: raw }, 'cursor');
}

function profileView(
  current: Awaited<ReturnType<NativeProfiles['current']>>,
  avatarMediaId: string | null,
) {
  return {
    user: {
      id: current.user.id,
      email: current.user.email,
      status: current.user.status,
      createdAt: Date.parse(current.user.createdAt),
    },
    profile: {
      username: current.profile.username,
      displayName: current.profile.displayName,
      bio: current.profile.bio,
      avatarMediaId,
      onboardingState: current.profile.onboardingState,
      updatedAt: Date.parse(current.profile.updatedAt),
    },
    preferences: current.preferences,
  };
}

function pick(data: unknown, keys: readonly string[]): Record<string, unknown> {
  const source =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return Object.fromEntries(
    keys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

export const getMyProfile = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'getMyProfile', 600, async () =>
    profileView(await profiles.current(uid), await readyAvatarMediaId(db, uid)),
  );
});

export const updateMyProfile = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const changes = pick(request.data, [
    'username',
    'displayName',
    'bio',
    'onboardingState',
  ]);
  return limited(uid, 'updateMyProfile', 30, async () =>
    profileView(
      await profiles.update(uid, changes),
      await readyAvatarMediaId(db, uid),
    ),
  );
});

export const updateMyPreferences = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const changes = pick(request.data, ['appearance', 'reactionPresets']);
  if (Object.keys(changes).length === 0)
    throw reasoned('invalid-argument', 'Invalid preferences.', 'INVALID_INPUT');
  return limited(uid, 'updateMyPreferences', 60, async () => {
    if (changes.appearance !== undefined)
      await profiles.updatePreferences(uid, {
        appearance: changes.appearance as 'light' | 'dark' | 'system',
      });
    if (changes.reactionPresets !== undefined)
      await profiles.setReactionPresets(
        uid,
        changes.reactionPresets as string[],
      );
    return (await profiles.current(uid)).preferences;
  });
});

export const listMyBoxes = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const cursor = optionalCursor(request.data);
  return limited(uid, 'listMyBoxes', 600, async () => {
    const page = await boxes.list(uid, cursor);
    return { items: page.items.map(boxView), nextCursor: page.nextCursor };
  });
});

export const createBox = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const name = field(request.data, 'name', 80);
  return limited(uid, 'createBox', 20, async () =>
    boxView(await boxes.create(uid, name)),
  );
});

export const getBox = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  return limited(uid, 'getBox', 1200, async () =>
    boxView(await boxes.get(boxId, uid)),
  );
});

export const listMyNotifications = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const cursor = optionalCursor(request.data);
  return limited(uid, 'listMyNotifications', 600, async () => {
    const views = new NativeViews(db, boxes, posts, lifeUpdates);
    await notifications.processPending();
    const page = await notifications.list(uid, cursor);
    return {
      items: await Promise.all(
        page.items.map((item) => views.notification(uid, item)),
      ),
      nextCursor: page.nextCursor,
      unreadCount: await notifications.unreadCount(uid),
    };
  });
});

export const countMyUnreadNotifications = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'countMyUnreadNotifications', 1200, async () => {
    await notifications.processPending();
    return notifications.unreadCount(uid);
  });
});

export const markNotificationRead = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const id = field(request.data, 'id');
  return limited(uid, 'markNotificationRead', 600, async () => {
    const item = await notifications.markRead(uid, id);
    return new NativeViews(db, boxes, posts, lifeUpdates).notification(uid, {
      ...item,
      read: true,
    });
  });
});

export const markAllNotificationsRead = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'markAllNotificationsRead', 60, async () => {
    await notifications.markAllRead(uid);
    return { ok: true };
  });
});

export const getHomeFeed = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const cursor = optionalCursor(request.data);
  return limited(uid, 'getHomeFeed', 600, async () => {
    // Repair a bounded amount of durable fan-out work, as the web adapter does.
    await homeFeed.processPending();
    const page = await homeFeed.page(uid, cursor);
    return {
      items: await new NativeViews(db, boxes, posts, lifeUpdates).feedItems(
        uid,
        page.items,
      ),
      nextCursor: page.nextCursor,
    };
  });
});

export const createMediaUpload = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'createMediaUpload', 480, async () => {
    // Camera reactions keep the web's tighter capture budget.
    const data = request.data as Record<string, unknown> | null;
    if (data?.purpose === 'reaction_image')
      await rateLimits.consume(uid, 'cameraUpload', 120, 60 * 60 * 1_000);
    const asset = await media.reserve(uid, request.data);
    return {
      mediaAsset: asset,
      upload: {
        method: 'PUT' as const,
        function: 'mediaUpload' as const,
        path: `/${asset.id}`,
        headers: { 'Content-Type': asset.contentType },
        expiresAt: asset.createdAt + 300_000,
      },
    };
  });
});

export const completeMediaUpload = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const assetId = field(request.data, 'assetId', 64);
  return limited(uid, 'completeMediaUpload', 480, () =>
    media.complete(uid, assetId),
  );
});

export const getMediaAsset = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const assetId = field(request.data, 'assetId', 64);
  return limited(uid, 'getMediaAsset', 1200, () => media.view(uid, assetId));
});

function viewsFor() {
  return new NativeViews(db, boxes, posts, lifeUpdates);
}

export const getMyRoom = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'getMyRoom', 600, async () =>
    roomView(db, viewsFor(), await rooms.get(uid)),
  );
});

export const getRoom = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const username = field(request.data, 'username', 100);
  return limited(uid, 'getRoom', 600, async () =>
    roomView(db, viewsFor(), await rooms.get(uid, username)),
  );
});

/** Native sends `expectedUpdatedAt` as epoch ms; the trusted schema takes ISO. */
function roomWrite(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw reasoned('invalid-argument', 'Invalid Room.', 'INVALID_INPUT');
  const input = { ...(data as Record<string, unknown>) };
  const version = isoVersion(input.expectedUpdatedAt);
  if (version === undefined)
    throw reasoned('invalid-argument', 'Invalid Room.', 'INVALID_INPUT');
  input.expectedUpdatedAt = version;
  return input;
}

export const updateMyRoom = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const input = roomWrite(request.data);
  return limited(uid, 'updateMyRoom', 60, async () => {
    const previous = await db.collection('nativeRooms').doc(uid).get();
    const oldBannerId = previous.get('bannerMediaId') as
      string | null | undefined;
    const room = await rooms.update(uid, input as never);
    // Same cleanup as the web adapter: a replaced banner is retired.
    if (
      input.bannerMediaId !== undefined &&
      oldBannerId &&
      oldBannerId !== input.bannerMediaId
    )
      await media.retire(oldBannerId);
    return roomView(db, viewsFor(), room);
  });
});

export const updateMyRoomWidgets = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const input = roomWrite(request.data);
  return limited(uid, 'updateMyRoomWidgets', 60, async () =>
    roomView(db, viewsFor(), await rooms.updateWidgets(uid, input as never)),
  );
});

export const updateMyRoomTopFriends = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const input = roomWrite(request.data);
  return limited(uid, 'updateMyRoomTopFriends', 60, async () =>
    roomView(db, viewsFor(), await rooms.updateTopFriends(uid, input as never)),
  );
});

export const listRoomPhotos = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const username = field(request.data, 'username', 100);
  return limited(uid, 'listRoomPhotos', 300, async () => {
    await homeFeed.processPending();
    return {
      items: await roomPhotos(db, memories, uid, username),
      nextCursor: null,
    };
  });
});

/** Reads the optional filter fields; the trusted service validates the ranges. */
function memoryFilter(data: unknown): NativeMemoryFilter {
  const raw = (data ?? {}) as Record<string, unknown>;
  const number = (key: string): number | undefined => {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isSafeInteger(value))
      throw reasoned('invalid-argument', `Invalid ${key}.`, 'INVALID_INPUT');
    return value;
  };
  const type = raw.type;
  if (
    type !== undefined &&
    type !== 'all' &&
    type !== 'posts' &&
    type !== 'life_updates'
  )
    throw reasoned('invalid-argument', 'Invalid type.', 'INVALID_INPUT');
  return {
    year: number('year'),
    month: number('month'),
    type,
    limit: number('limit'),
  };
}

function memoryList(
  name: string,
  scopeOf: (data: unknown) => NativeMemoryScope,
) {
  return async (request: CallableRequest) => {
    const uid = await requireSession(request.auth);
    const scope = scopeOf(request.data);
    const filter = memoryFilter(request.data);
    const cursor = optionalCursor(request.data);
    return limited(uid, name, 600, async () => {
      // Expanding also proves the cursor belongs to this scope and filter.
      const long =
        cursor === undefined
          ? undefined
          : expandMemoryCursor(cursor, scope, filter);
      await homeFeed.processPending();
      const page = await memories.page(uid, scope, { ...filter, cursor: long });
      return {
        items: await viewsFor().memoryItems(uid, page.items),
        nextCursor:
          page.nextCursor === null
            ? null
            : compactMemoryCursor(page.nextCursor, scope, filter),
      };
    });
  };
}

function memorySummary(
  name: string,
  scopeOf: (data: unknown) => NativeMemoryScope,
) {
  return async (request: CallableRequest) => {
    const uid = await requireSession(request.auth);
    const scope = scopeOf(request.data);
    const year = memoryFilter(request.data).year;
    // An exact scan of everything the viewer can see: keep the budget tight.
    return limited(uid, name, 60, async () => {
      await homeFeed.processPending();
      return memories.summary(uid, scope, year);
    });
  };
}

const personalScope = (): NativeMemoryScope => ({ kind: 'personal' });
const boxScope = (data: unknown): NativeMemoryScope => ({
  kind: 'box',
  boxId: field(data, 'boxId'),
});
const roomScope = (data: unknown): NativeMemoryScope => ({
  kind: 'room',
  username: field(data, 'username', 100),
});

export const listMyMemories = onCall(
  options,
  memoryList('listMyMemories', personalScope),
);
export const getMyMemorySummary = onCall(
  options,
  memorySummary('getMyMemorySummary', personalScope),
);
export const listBoxMemories = onCall(
  options,
  memoryList('listBoxMemories', boxScope),
);
export const getBoxMemorySummary = onCall(
  options,
  memorySummary('getBoxMemorySummary', boxScope),
);
export const listRoomMemories = onCall(
  options,
  memoryList('listRoomMemories', roomScope),
);
export const getRoomMemorySummary = onCall(
  options,
  memorySummary('getRoomMemorySummary', roomScope),
);

/** Server-only Auth REST boundary for reauthentication (same class as the web). */
let webSessionsInstance: NativeWebSessions | undefined;
function webSessions(): NativeWebSessions {
  if (webSessionsInstance) return webSessionsInstance;
  const local =
    process.env.FUNCTIONS_EMULATOR === 'true' &&
    process.env.GCLOUD_PROJECT === 'demo-paldora';
  // The Auth emulator ignores the key; hosted deploys must configure it.
  const apiKey =
    process.env.FIREBASE_WEB_API_KEY ?? (local ? 'demo-api-key' : undefined);
  if (!apiKey)
    throw new HttpsError('failed-precondition', 'Action unavailable.');
  const restBaseUrl = local
    ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com';
  webSessionsInstance = new NativeWebSessions(
    getAuth(),
    db,
    restBaseUrl,
    apiKey,
  );
  return webSessionsInstance;
}

const reauthenticate = (uid: string, email: string, password: string) =>
  webSessions().reauthenticate(uid, email, password);
const signInAgain = { ok: true, signInRequired: true } as const;
const epoch = (value: string | null) =>
  value === null ? null : Date.parse(value);

type ExportView = Awaited<ReturnType<NativeAccountLifecycle['latestExport']>>;
function exportView(row: NonNullable<ExportView['export']>) {
  return {
    id: row.id,
    status: row.status,
    createdAt: Date.parse(row.createdAt),
    readyAt: epoch(row.readyAt),
    expiresAt: epoch(row.expiresAt),
  };
}
type DeletionView = NonNullable<
  Awaited<ReturnType<NativeAccountLifecycle['currentDeletion']>>['deletion']
>;
function deletionView(row: DeletionView) {
  return {
    id: row.id,
    status: row.status,
    requestedAt: Date.parse(row.requestedAt),
    dueAt: Date.parse(row.dueAt),
    cancelledAt: epoch(row.cancelledAt),
  };
}

export const changeMyPassword = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const currentPassword = field(request.data, 'currentPassword', 1_024);
  const newPassword = field(request.data, 'newPassword', 1_024);
  if (newPassword.length < 10)
    throw reasoned('invalid-argument', 'Invalid password.', 'INVALID_INPUT');
  return limited(uid, 'changeMyPassword', 5, async () => {
    const email = (await getAuth().getUser(uid)).email;
    if (!email)
      throw new HttpsError('permission-denied', 'Action unavailable.');
    await webSessions().changePassword(
      uid,
      email,
      currentPassword,
      newPassword,
    );
    callableSessions.forget(uid);
    return signInAgain;
  });
});

export const signOutEverywhere = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'signOutEverywhere', 5, async () => {
    await webSessions().signOutEverywhere(uid);
    callableSessions.forget(uid);
    return signInAgain;
  });
});

export const requestAccountExport = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'requestAccountExport', 5, async () => ({
    export: exportView(await accountLifecycle.requestExport(uid)),
  }));
});

export const getAccountExport = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'getAccountExport', 120, async () => {
    const { export: latest } = await accountLifecycle.latestExport(uid);
    return { export: latest ? exportView(latest) : null };
  });
});

export const getAccountDeletion = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'getAccountDeletion', 120, async () => {
    const { deletion } = await accountLifecycle.currentDeletion(uid);
    return { deletion: deletion ? deletionView(deletion) : null };
  });
});

export const requestAccountDeletion = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const password = field(request.data, 'password', 256);
  return limited(uid, 'requestAccountDeletion', 5, async () => ({
    deletion: deletionView(
      await accountLifecycle.requestDeletion(uid, password, reauthenticate),
    ),
  }));
});

export const cancelAccountDeletion = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const password = field(request.data, 'password', 256);
  return limited(uid, 'cancelAccountDeletion', 5, async () => ({
    deletion: deletionView(
      await accountLifecycle.cancelDeletion(uid, password, reauthenticate),
    ),
  }));
});

export const reportBoxComment = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const parsed = native.reportBoxCommentInputSchema.safeParse(request.data);
  if (!parsed.success)
    throw reasoned('invalid-argument', 'Invalid report.', 'INVALID_INPUT');
  const { commentId, category, detail } = parsed.data;
  return limited(uid, 'reportBoxComment', 20, async () => ({
    reportId: (
      await moderation.createReport(uid, {
        targetKind: 'comment',
        targetId: commentId,
        category,
        detail,
      })
    ).id,
  }));
});

export const listMyReports = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const parsed = native.listMyReportsInputSchema.safeParse(request.data ?? {});
  if (!parsed.success)
    throw reasoned('invalid-argument', 'Invalid cursor.', 'INVALID_INPUT');
  return limited(uid, 'listMyReports', 120, async () => {
    const page = await moderation.myReports(uid, parsed.data.cursor, 20);
    return {
      items: page.items.map((item) => ({
        id: item.id,
        targetKind: item.targetKind,
        targetId: item.targetId,
        category: item.category,
        status: item.status,
        createdAt: item.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  });
});

export const listMyModerationNotices = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'listMyModerationNotices', 120, async () => ({
    items: await moderation.notices(uid),
  }));
});

function uuidCursor(data: unknown): string | undefined {
  const cursor =
    data && typeof data === 'object'
      ? (data as Record<string, unknown>).cursor
      : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor))
  )
    throw reasoned('invalid-argument', 'Invalid cursor.', 'INVALID_INPUT');
  return cursor;
}

/** Owner only. Same trusted write as the web rename, archive and restore. */
export const updateBox = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const data = request.data as Record<string, unknown>;
  const name = data.name === undefined ? undefined : field(data, 'name', 80);
  const status = data.status;
  if (status !== undefined && status !== 'active' && status !== 'archived')
    throw reasoned('invalid-argument', 'Invalid Box status.', 'INVALID_INPUT');
  if (name === undefined && status === undefined)
    throw reasoned('invalid-argument', 'Invalid Box update.', 'INVALID_INPUT');
  return limited(uid, 'updateBox', 60, async () =>
    boxView(
      await boxes.update(boxId, uid, {
        ...(name === undefined ? {} : { name }),
        ...(status === undefined ? {} : { status }),
      }),
    ),
  );
});

export const setBoxMemberRole = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const memberUid = field(request.data, 'memberUid');
  const role = (request.data as Record<string, unknown>).role;
  if (role !== 'admin' && role !== 'member')
    throw reasoned('invalid-argument', 'Invalid role.', 'INVALID_INPUT');
  return limited(uid, 'setBoxMemberRole', 120, async () => {
    await boxes.changeRole(boxId, uid, memberUid, role);
    return { ok: true };
  });
});

export const removeBoxMember = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const memberUid = field(request.data, 'memberUid');
  return limited(uid, 'removeBoxMember', 120, async () => {
    await boxes.removeMember(boxId, uid, memberUid);
    return { ok: true };
  });
});

/** The web "Leave Box" is `removeMember` on yourself; the owner must transfer first. */
export const leaveBox = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  return limited(uid, 'leaveBox', 30, async () => {
    await boxes.removeMember(boxId, uid, uid);
    return { ok: true };
  });
});

export const transferBoxOwnership = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const memberUid = field(request.data, 'memberUid');
  return limited(uid, 'transferBoxOwnership', 10, async () => {
    await boxes.transfer(boxId, uid, memberUid);
    return { ok: true };
  });
});

/** Requester only and pending only; unlike `closeFriendship` the request is deleted. */
export const cancelFriendRequest = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const requestId = field(request.data, 'requestId', 64);
  return limited(uid, 'cancelFriendRequest', 120, async () => {
    await friendships.cancel(requestId, uid);
    return { ok: true };
  });
});

export const listBoxCommentThreads = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const cursor = uuidCursor(request.data);
  return limited(uid, 'listBoxCommentThreads', 600, async () => {
    const page = await posts.commentThreadsPage(boxId, postId, uid, cursor);
    return { ...page, items: page.items.map(commentThreadView) };
  });
});

export const listBoxCommentReplies = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const rootId = field(request.data, 'rootId', 64);
  const cursor = uuidCursor(request.data);
  return limited(uid, 'listBoxCommentReplies', 600, async () => {
    const page = await posts.listCommentReplies(
      boxId,
      postId,
      rootId,
      uid,
      cursor,
    );
    return { ...page, items: page.items.map(commentItemView) };
  });
});

export const getBoxCommentThread = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  const boxId = field(request.data, 'boxId');
  const postId = field(request.data, 'postId', 64);
  const commentId = field(request.data, 'commentId', 64);
  return limited(uid, 'getBoxCommentThread', 600, () =>
    pinnedCommentThread(posts, boxId, postId, commentId, uid),
  );
});

/** Clears the avatar and a pending avatar upload, retiring both assets. */
export const deleteAvatar = onCall(options, async (request) => {
  const uid = await requireSession(request.auth);
  return limited(uid, 'deleteAvatar', 30, async () => {
    await media.removeAvatar(uid);
    return { ok: true };
  });
});

const mediaHttp = {
  verifyIdToken: async (token: string) => {
    const decoded = await getAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      paldoraSessionEpoch: decoded.paldoraSessionEpoch,
    };
  },
  sessions: callableSessions,
  rateLimits,
  media,
};

/** `PUT /{assetId}`; body limit equals the largest media policy. */
export const mediaUpload = onRequest(
  {
    region: 'europe-west4',
    maxInstances: 2,
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: false,
  },
  (request, response) => handleMediaUpload(request, response, mediaHttp),
);

/** `GET /{assetId}/{display|thumbnail}`; authorization runs on every read. */
export const mediaRead = onRequest(
  {
    region: 'europe-west4',
    maxInstances: 2,
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: false,
  },
  (request, response) => handleMediaRead(request, response, mediaHttp),
);

/** `GET /{exportId}`: the caller's latest ready archive, streamed. */
export const accountExportDownload = onRequest(
  {
    region: 'europe-west4',
    maxInstances: 2,
    memory: '512MiB',
    timeoutSeconds: 300,
    cors: false,
  },
  (request, response) =>
    handleAccountExportDownload(request, response, {
      ...mediaHttp,
      lifecycle: accountLifecycle,
    }),
);

/** Compile-time proof that the exports above and `callableNames` agree. */
void ({
  beginBoxDeletion,
  boxDeletionStatus,
  createLifeUpdate,
  getLifeUpdate,
  listMyLifeUpdates,
  editLifeUpdate,
  deleteLifeUpdate,
  inviteBox,
  provisionMyAccount,
  sendFriendRequest,
  acceptFriendRequest,
  closeFriendship,
  listMyFriendships,
  listMyBoxInvitations,
  listBoxInvitations,
  listBoxMembers,
  acceptBoxInvitation,
  declineBoxInvitation,
  revokeBoxInvitation,
  reserveUsername,
  createBoxPost,
  getBoxPost,
  listBoxPosts,
  editBoxPost,
  deleteBoxPost,
  setUserBlock,
  listMyBlocks,
  createBoxComment,
  listBoxComments,
  editBoxComment,
  deleteBoxComment,
  setBoxReaction,
  listBoxReactions,
  reportBoxPost,
  listModerationReports,
  hideReportedPost,
  getMyProfile,
  updateMyProfile,
  updateMyPreferences,
  listMyBoxes,
  createBox,
  getBox,
  listMyNotifications,
  countMyUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getHomeFeed,
  createMediaUpload,
  completeMediaUpload,
  getMediaAsset,
  getMyRoom,
  getRoom,
  updateMyRoom,
  updateMyRoomWidgets,
  updateMyRoomTopFriends,
  listRoomPhotos,
  listMyMemories,
  getMyMemorySummary,
  listBoxMemories,
  getBoxMemorySummary,
  listRoomMemories,
  getRoomMemorySummary,
  changeMyPassword,
  signOutEverywhere,
  requestAccountExport,
  getAccountExport,
  getAccountDeletion,
  requestAccountDeletion,
  cancelAccountDeletion,
  reportBoxComment,
  listMyReports,
  listMyModerationNotices,
  updateBox,
  setBoxMemberRole,
  removeBoxMember,
  leaveBox,
  transferBoxOwnership,
  cancelFriendRequest,
  listBoxCommentThreads,
  listBoxCommentReplies,
  getBoxCommentThread,
  deleteAvatar,
} satisfies Record<CallableName, unknown>);
