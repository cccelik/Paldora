import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { NativeModeration } from '../dist/index.js';

if (
  process.env.GCLOUD_PROJECT !== 'demo-paldora' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
)
  throw new Error(
    'Staff grants are local-only and require the disposable Firestore emulator without credentials.',
  );

const usage =
  'Usage: staff-grant.mjs --grant <uid> --role <moderator|administrator> --operator <label> | --revoke <uid> --operator <label>';
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const flags = new Map();
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const value = args[i + 1];
  if (!key?.startsWith('--') || value === undefined || flags.has(key))
    throw new Error(usage);
  flags.set(key, value);
}
const operator = flags.get('--operator');
const grant = flags.get('--grant');
const revoke = flags.get('--revoke');
const role = flags.get('--role');
const valid =
  operator &&
  ((grant && !revoke && flags.size === 3 && role) ||
    (revoke && !grant && flags.size === 2));
if (!valid) throw new Error(usage);

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `staff-grant-${randomUUID()}`,
);
try {
  const moderation = new NativeModeration(getFirestore(app));
  if (grant) {
    await moderation.grantStaff(operator, grant, role);
    process.stdout.write(`Granted staff ${grant}.\n`);
  } else {
    await moderation.revokeStaff(operator, revoke);
    process.stdout.write(`Revoked staff ${revoke}.\n`);
  }
} finally {
  await deleteApp(app);
}
