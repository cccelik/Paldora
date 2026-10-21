import { requireEnvironmentVariables } from '@paldora/config';
import { createDatabaseConnection } from '@paldora/database';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { changeStaffGrant } from './staff-grant.js';

const { values } = parseArgs({
  options: {
    actor: { type: 'string' },
    target: { type: 'string' },
    action: { type: 'string' },
    role: { type: 'string' },
    reason: { type: 'string' },
    bootstrap: { type: 'boolean', default: false },
  },
});
const command = z
  .object({
    actor: z.uuid(),
    target: z.uuid(),
    action: z.enum(['grant', 'revoke']),
    role: z.enum(['moderator', 'administrator']).optional(),
    reason: z.string().min(20).max(1000),
    bootstrap: z.boolean(),
  })
  .parse(values);
const { DATABASE_URL } = requireEnvironmentVariables(
  ['DATABASE_URL'],
  process.env,
);
const connection = createDatabaseConnection({
  connectionString: DATABASE_URL ?? '',
  poolMax: 2,
  applicationName: 'paldora-staff-command',
});
try {
  const result = await changeStaffGrant(connection.database, {
    actorUserId: command.actor,
    targetUserId: command.target,
    action: command.action,
    ...(command.role ? { role: command.role } : {}),
    reason: command.reason,
    bootstrap: command.bootstrap,
  });
  process.stdout.write(
    result.changed
      ? 'Staff grant updated and audited.\n'
      : 'No grant changed.\n',
  );
} finally {
  await connection.close();
}
