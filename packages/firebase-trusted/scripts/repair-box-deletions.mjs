import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { NativeBoxDeletion } from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199'
)
  throw new Error(
    'Box repair requires disposable Firestore and Storage emulators.',
  );

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `box-repair-${randomUUID()}`,
);
try {
  const bucket = getStorage(app).bucket(
    process.env.FIREBASE_STORAGE_BUCKET ?? 'demo-paldora.firebasestorage.app',
  );
  const deletion = new NativeBoxDeletion(getFirestore(app), async (path) => {
    await bucket.file(path).delete({ ignoreNotFound: true });
  });
  let steps = 0;
  while (steps < 500) {
    const batch = await deletion.repairPending(Date.now(), 25);
    if (batch.length === 0) break;
    steps += batch.length;
    if (batch.every((item) => item.blocked)) break;
  }
  process.stdout.write(`Processed ${steps} Box deletion steps.\n`);
} finally {
  await deleteApp(app);
}
