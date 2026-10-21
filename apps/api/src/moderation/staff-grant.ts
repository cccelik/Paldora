import {
  moderationAudit,
  staffGrants,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

export interface StaffChange {
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly action: 'grant' | 'revoke';
  readonly role?: 'moderator' | 'administrator';
  readonly reason: string;
  /** Only for the first administrator, with an otherwise empty staff table. */
  readonly bootstrap?: boolean;
}

function authorizeGrant(
  request: StaffChange,
  grants: readonly { userId: string; role: 'moderator' | 'administrator' }[],
) {
  const bootstrap =
    request.bootstrap === true &&
    grants.length === 0 &&
    request.action === 'grant' &&
    request.role === 'administrator' &&
    request.actorUserId === request.targetUserId;
  if (
    !bootstrap &&
    !grants.some(
      (row) =>
        row.userId === request.actorUserId && row.role === 'administrator',
    )
  )
    throw new Error('An existing administrator is required.');
  const previous = grants.find((row) => row.userId === request.targetUserId);
  if (
    request.action === 'revoke' &&
    previous?.role === 'administrator' &&
    grants.filter((row) => row.role === 'administrator').length === 1
  )
    throw new Error('The last administrator cannot be revoked.');
  return previous;
}

/** Operator-only command path. Never expose it as an HTTP route. */
export async function changeStaffGrant(
  db: PaldoraDatabase,
  request: StaffChange,
) {
  if (request.reason.trim().length < 20 || request.reason.length > 1000)
    throw new Error('A reason of 20–1000 characters is required.');
  if (request.action === 'grant' && !request.role)
    throw new Error('A role is required when granting staff access.');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(980221001)`);
    const [actor, target, grants] = await Promise.all([
      tx
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.id, request.actorUserId))
        .limit(1),
      tx
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.id, request.targetUserId))
        .limit(1),
      tx
        .select({ userId: staffGrants.userId, role: staffGrants.role })
        .from(staffGrants),
    ]);
    if (actor[0]?.status !== 'active' || target[0]?.status !== 'active')
      throw new Error('Actor and target must be active accounts.');
    const previous = authorizeGrant(request, grants);
    if (request.action === 'grant' && request.role) {
      await tx
        .insert(staffGrants)
        .values({ userId: request.targetUserId, role: request.role })
        .onConflictDoUpdate({
          target: staffGrants.userId,
          set: { role: request.role },
        });
    } else {
      if (!previous) return { changed: false };
      await tx
        .delete(staffGrants)
        .where(eq(staffGrants.userId, request.targetUserId));
    }
    await tx.insert(moderationAudit).values({
      actorUserId: request.actorUserId,
      subjectId: request.targetUserId,
      event: request.action === 'grant' ? 'staff.granted' : 'staff.revoked',
      reason: request.reason.trim(),
      idempotencyKey: randomUUID(),
    });
    return { changed: true };
  });
}
