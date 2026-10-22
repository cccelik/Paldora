import {
  NativeBoxInvitations,
  NativeInvitationError,
  NativeUsernameError,
  NativeUsernames,
} from '@paldora/firebase-trusted';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (getApps().length === 0) initializeApp();
const db = getFirestore();
const invitations = new NativeBoxInvitations(db);
const usernames = new NativeUsernames(db);
const options = { region: 'europe-west4', maxInstances: 1 } as const;

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

async function invoke<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof NativeInvitationError) {
      if (error.code === 'FORBIDDEN')
        throw new HttpsError('permission-denied', 'Action unavailable.');
      if (error.code === 'ALREADY_MEMBER' || error.code === 'ALREADY_PENDING')
        throw new HttpsError('already-exists', 'Action unavailable.');
      if (error.code === 'EXPIRED')
        throw new HttpsError('failed-precondition', 'Invitation expired.');
      throw new HttpsError('not-found', 'Action unavailable.');
    }
    if (error instanceof NativeUsernameError) {
      if (error.code === 'TAKEN')
        throw new HttpsError('already-exists', 'Username unavailable.');
      throw new HttpsError('failed-precondition', 'Username unavailable.');
    }
    throw error;
  }
}

export const inviteBox = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const boxId = field(request.data, 'boxId');
  const username = field(request.data, 'username', 30);
  return invoke(async () => ({
    invitationId: await invitations.inviteByUsername(boxId, uid, username),
  }));
});

export const acceptBoxInvitation = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const invitationId = field(request.data, 'invitationId', 64);
  return invoke(async () => ({
    boxId: await invitations.accept(invitationId, uid),
  }));
});

export const declineBoxInvitation = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const invitationId = field(request.data, 'invitationId', 64);
  return invoke(async () => {
    await invitations.decline(invitationId, uid);
    return { ok: true };
  });
});

export const revokeBoxInvitation = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const invitationId = field(request.data, 'invitationId', 64);
  const boxId = field(request.data, 'boxId');
  return invoke(async () => {
    await invitations.revoke(invitationId, boxId, uid);
    return { ok: true };
  });
});

export const reserveUsername = onCall(options, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const username = field(request.data, 'username', 30);
  return invoke(async () => ({
    normalized: await usernames.reserve(uid, username),
  }));
});
