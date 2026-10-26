import { NativeWebSessions } from '@paldora/firebase-trusted';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { cookies } from 'next/headers';
import { cache } from 'react';
import {
  assertHostedEnvironment,
  deploymentEnvironment,
} from '@/lib/server/environment';
import 'server-only';

export const FIREBASE_SESSION_COOKIE = 'paldora_session';
const APP_NAME = 'paldora-web';

/** Separate from the old web environment until the Firebase cutover gate. */
function configuration() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!projectId || !apiKey)
    throw new Error('Firebase web identity is not configured.');
  assertHostedEnvironment();
  if (deploymentEnvironment() === 'local') {
    if (
      projectId !== 'demo-paldora' ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
      process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
      process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199' ||
      process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST !== '127.0.0.1:5001'
    )
      throw new Error('Local Firebase identity requires the demo emulators.');
    return {
      projectId,
      apiKey,
      restBaseUrl: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com',
    };
  }
  return {
    projectId,
    apiKey,
    restBaseUrl: 'https://identitytoolkit.googleapis.com',
  };
}

function services() {
  const config = configuration();
  const app =
    getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp({ projectId: config.projectId }, APP_NAME);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const bucket = storage.bucket(
    process.env.FIREBASE_STORAGE_BUCKET ??
      `${config.projectId}.firebasestorage.app`,
  );
  return {
    db,
    auth,
    bucket,
    storage,
    sessions: new NativeWebSessions(
      auth,
      db,
      config.restBaseUrl,
      config.apiKey,
    ),
  };
}

export function firebaseAdminServices() {
  return services();
}

export const firebaseSessionUid = cache(async (): Promise<string | null> => {
  const cookie = (await cookies()).get(FIREBASE_SESSION_COOKIE)?.value;
  if (!cookie) return null;
  return services()
    .sessions.verify(cookie)
    .catch(() => null);
});
