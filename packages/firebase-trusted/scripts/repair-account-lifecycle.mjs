import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { NativeAccountLifecycle } from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199'
)
  throw new Error(
    'Account repair requires disposable Auth, Firestore and Storage emulators.',
  );

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `account-repair-${randomUUID()}`,
);
try {
  const db = getFirestore(app);
  const lifecycle = new NativeAccountLifecycle(
    db,
    getAuth(app),
    getStorage(app),
    process.env.FIREBASE_STORAGE_BUCKET ?? 'demo-paldora.firebasestorage.app',
  );
  await lifecycle.repairExports();
  for (let pass = 0; pass < 500; pass += 1) {
    const due = await db
      .collection('nativeDeletionRequests')
      .where('status', 'in', ['pending', 'blocked', 'running'])
      .limit(50)
      .get();
    const actionable = due.docs.filter(
      (row) =>
        row.get('status') === 'running' || row.get('dueAt') <= Date.now(),
    );
    if (actionable.length === 0) break;
    for (const row of actionable) await lifecycle.processDeletion(row.id);
    if (actionable.every((row) => row.get('status') === 'blocked')) break;
  }
  process.stdout.write('Account lifecycle repair pass completed.\n');
} finally {
  await deleteApp(app);
}
