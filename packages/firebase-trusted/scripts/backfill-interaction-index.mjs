import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { NativeInteractionIndex } from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
)
  throw new Error(
    'Interaction index backfill is local-only and requires the disposable Firestore emulator without credentials.',
  );

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `interaction-index-backfill-${randomUUID()}`,
);
try {
  const index = new NativeInteractionIndex(getFirestore(app));
  let cursor = null;
  let repaired = 0;
  let pages = 0;
  do {
    const page = await index.backfillPage(cursor, 100);
    repaired += page.repaired;
    pages += 1;
    cursor = page.nextCursor;
  } while (cursor);
  process.stdout.write(`Repaired ${repaired} posts in ${pages} pages.\n`);
} finally {
  await deleteApp(app);
}
