import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { NativeMedia } from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199'
)
  throw new Error(
    'Media repair requires disposable Firestore and Storage emulators.',
  );

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `media-repair-${randomUUID()}`,
);
try {
  const db = getFirestore(app);
  const media = new NativeMedia(
    db,
    getStorage(app),
    process.env.FIREBASE_STORAGE_BUCKET ?? 'demo-paldora.firebasestorage.app',
  );
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args[0] === '--retry') {
    if (args.length !== 2)
      throw new Error('Pass one dead media job ID after --retry.');
    await media.retryDead(args[1]);
    process.stdout.write(`Replayed ${args[1]}.\n`);
  } else if (args.length > 0) {
    throw new Error('Usage: repair-media.mjs [--retry media-job-id]');
  } else {
    const processed = await media.repairPending(100);
    const expired = await media.expireUnattached(100);
    const dead = await db
      .collection('nativeJobs')
      .where('type', '==', 'media')
      .where('status', '==', 'dead')
      .limit(100)
      .get();
    process.stdout.write(
      `Processed ${processed} jobs and expired ${expired} assets.\n`,
    );
    if (!dead.empty)
      process.stdout.write(
        `Dead media jobs requiring review: ${dead.docs.map((job) => job.id).join(', ')}\n`,
      );
  }
} finally {
  await deleteApp(app);
}
