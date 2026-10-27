// OWNER-RUN ONLY. Single-operator break-glass staff grant for a hosted
// staging/production project (ADR 020). Uses Application Default Credentials
// (`gcloud auth application-default login`), never key files. Not run in CI.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { NativeModeration } from '../dist/index.js';
import {
  confirmationPhrase,
  validateHostedGrant,
} from './staff-grant-hosted-guards.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const request = validateHostedGrant(
  process.argv.slice(2),
  process.env,
  repoRoot,
);
const { project, operatorLabel, grant, role } = request;

if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw new Error(
    'An interactive terminal is required for the typed confirmation.',
  );

/** Alarm source: a structured entry for a log-based metric (verify against current official docs). */
function writeBreakGlassLog(payload) {
  return new Promise((resolve, reject) => {
    execFile(
      'gcloud',
      [
        'logging',
        'write',
        'paldora-staff-audit',
        JSON.stringify(payload),
        '--payload-type=json',
        '--severity=WARNING',
        `--project=${project}`,
      ],
      (error) =>
        error
          ? reject(
              new Error(
                'Could not write the break-glass log entry; nothing was granted.',
              ),
            )
          : resolve(),
    );
  });
}

const app = initializeApp(
  { projectId: project, credential: applicationDefault() },
  `staff-grant-hosted-${randomUUID()}`,
);
try {
  const db = getFirestore(app);
  const account = await db.collection('nativeAccounts').doc(grant).get();
  if (!account.exists || account.get('status') !== 'active')
    throw new Error('Target is not an existing active account.');
  process.stdout.write(
    `Project ${project}: grant ${role} to active account ${grant} (@${account.get('username') ?? 'no-username'}) as break-glass, operator ${operatorLabel}.\n`,
  );
  const phrase = confirmationPhrase(request);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type exactly "${phrase}" to continue: `);
  rl.close();
  if (answer !== phrase)
    throw new Error('Confirmation did not match; nothing was granted.');
  await writeBreakGlassLog({
    event: 'staff.grant.break_glass',
    targetUid: grant,
    role,
    operatorLabel,
    breakGlass: true,
  });
  await new NativeModeration(db).grantStaff(operatorLabel, grant, role, {
    breakGlass: true,
  });
  process.stdout.write(`Granted ${role} to ${grant} with breakGlass:true.\n`);
} finally {
  await deleteApp(app);
}
