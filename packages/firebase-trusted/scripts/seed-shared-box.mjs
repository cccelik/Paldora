import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  NativeBoxes,
  NativeBoxInvitations,
  NativeBoxPosts,
} from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
)
  throw new Error('Shared-Box fixtures require the demo-paldora emulators.');

const owner = process.env.PALDORA_FIXTURE_OWNER_UID;
const member = process.env.PALDORA_FIXTURE_MEMBER_UID;
if (!owner || !member)
  throw new Error(
    'Set PALDORA_FIXTURE_OWNER_UID and PALDORA_FIXTURE_MEMBER_UID.',
  );

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `shared-box-${randomUUID()}`,
);
try {
  const db = getFirestore(app);
  const box = await new NativeBoxes(db).create(owner, 'Shared UI Box');
  const invitations = new NativeBoxInvitations(db);
  const invitationId = await invitations.invite(box.id, owner, member);
  await invitations.accept(invitationId, member);
  const posts = new NativeBoxPosts(db);
  const postId = await posts.create(box.id, owner, 'Peer post for UI tests');
  await posts.createComment(box.id, postId, owner, 'Peer comment for UI tests');
  process.stdout.write(`Seeded a shared Box with a post and comment.\n`);
} finally {
  await deleteApp(app);
}
