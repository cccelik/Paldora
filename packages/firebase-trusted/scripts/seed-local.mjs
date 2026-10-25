import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { NativeAccounts } from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199' ||
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST !== '127.0.0.1:5001'
) {
  throw new Error('Fixture seeding requires all four demo-paldora emulators.');
}

const email = process.env.PALDORA_FIXTURE_EMAIL?.trim();
const password = process.env.PALDORA_FIXTURE_PASSWORD;
if (!email || !password || password.length < 10)
  throw new Error(
    'Set PALDORA_FIXTURE_EMAIL and a password of at least 10 characters.',
  );

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `fixture-${randomUUID()}`,
);
try {
  const auth = getAuth(app);
  const uid = randomUUID();
  await auth.createUser({ uid, email, password, emailVerified: true });
  await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  await new NativeAccounts(getFirestore(app), auth).provision(uid);
  process.stdout.write(
    `Created local fixture account ${email} (${uid}), schema v1.\n`,
  );
} finally {
  await deleteApp(app);
}
