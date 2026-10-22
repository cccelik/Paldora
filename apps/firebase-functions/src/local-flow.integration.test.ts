import { randomUUID } from 'node:crypto';
import { NativeAccounts, NativeUsernames } from '@paldora/firebase-trusted';
import { createBox, getBox } from '@paldora/firebase-native';
import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions';
import { afterAll, describe, expect, it } from 'vitest';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST
)
  throw new Error(
    'This test requires the disposable Auth, Firestore, and Functions emulators',
  );

const adminApp = initializeAdminApp(
  { projectId: 'demo-paldora' },
  `flow-${randomUUID()}`,
);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const accounts = new NativeAccounts(adminDb, adminAuth);
const usernames = new NativeUsernames(adminDb);
const clientApps: ReturnType<typeof initializeApp>[] = [];

afterAll(async () => {
  await Promise.all(clientApps.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
});

async function client(username: string) {
  const uid = randomUUID();
  const password = `Local-${randomUUID()}!`;
  const email = `${uid}@example.invalid`;
  await adminAuth.createUser({ uid, email, password, emailVerified: true });
  await accounts.provision(uid);
  await usernames.reserve(uid, username);
  const app = initializeApp(
    { projectId: 'demo-paldora', apiKey: 'demo-api-key', appId: `demo-${uid}` },
    `client-${uid}`,
  );
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'europe-west4');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(auth, email, password);
  return { uid, db, functions };
}

describe('local Firebase Box vertical flow', () => {
  it('requires Auth and grants Box reads only after invitation acceptance', async () => {
    const ownerName = `owner_${randomUUID().slice(0, 8)}`;
    const owner = await client(ownerName);
    const guestName = `guest_${randomUUID().slice(0, 8)}`;
    const guest = await client(guestName);
    const boxId = randomUUID();
    await createBox(owner.db, owner.uid, 'Crew', boxId);
    await expect(getBox(guest.db, boxId)).rejects.toThrow();
    const invite = httpsCallable<
      { boxId: string; username: string },
      { invitationId: string }
    >(owner.functions, 'inviteBox');
    const { data } = await invite({ boxId, username: guestName });
    await expect(getBox(guest.db, boxId)).rejects.toThrow();
    const accept = httpsCallable<{ invitationId: string }, { boxId: string }>(
      guest.functions,
      'acceptBoxInvitation',
    );
    expect((await accept({ invitationId: data.invitationId })).data.boxId).toBe(
      boxId,
    );
    expect(await getBox(guest.db, boxId)).toMatchObject({
      id: boxId,
      ownerUid: owner.uid,
    });
    const guestInvite = httpsCallable<{ boxId: string; username: string }>(
      guest.functions,
      'inviteBox',
    );
    await expect(
      guestInvite({ boxId, username: ownerName }),
    ).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
    const anonymousApp = initializeApp(
      {
        projectId: 'demo-paldora',
        apiKey: 'demo-api-key',
        appId: 'demo-anonymous',
      },
      `anonymous-${randomUUID()}`,
    );
    clientApps.push(anonymousApp);
    const anonymousFunctions = getFunctions(anonymousApp, 'europe-west4');
    connectFunctionsEmulator(anonymousFunctions, '127.0.0.1', 5001);
    const anonymousInvite = httpsCallable<{ boxId: string; username: string }>(
      anonymousFunctions,
      'inviteBox',
    );
    await expect(
      anonymousInvite({ boxId, username: guestName }),
    ).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    });
  }, 30_000);
});
