import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  accountDeletionRequests,
  boxMemberships,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  DATABASE,
  PASSWORD_REAUTHENTICATOR,
} from '../platform/config/tokens.js';
import { defineError } from '../platform/http/api-error.js';
import type { PasswordReauthenticator } from './password-reauthenticator.js';

const dayMs = 24 * 60 * 60 * 1_000;
const live = ['pending', 'blocked'] as const;

const reauthFailed = defineError(
  HttpStatus.FORBIDDEN,
  'ACCOUNT_REAUTH_FAILED',
  'Reauthentication failed.',
);
const ownershipRequired = defineError(
  HttpStatus.CONFLICT,
  'BOX_OWNERSHIP_TRANSFER_REQUIRED',
  'Transfer ownership of every Box before requesting deletion.',
);
const deletionNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'ACCOUNT_DELETION_NOT_FOUND',
  'No active deletion request was found.',
);

const view = (row: typeof accountDeletionRequests.$inferSelect) => ({
  id: row.id,
  status: row.status,
  requestedAt: row.requestedAt.toISOString(),
  dueAt: row.dueAt.toISOString(),
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
});

@Injectable()
export class AccountDeletionService {
  public constructor(
    @Inject(DATABASE) private readonly db: PaldoraDatabase,
    @Inject(PASSWORD_REAUTHENTICATOR)
    private readonly reauth: PasswordReauthenticator,
  ) {}

  private async verify(me: AuthenticatedPrincipal, password: string) {
    const [user] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, me.userId));
    if (!user || !(await this.reauth.verify(user.email, password, me.subject)))
      throw reauthFailed();
    return user.email;
  }

  public async request(me: AuthenticatedPrincipal, password: string) {
    const email = await this.verify(me, password);
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, me.userId))
        .for('update');
      if (!user || user.email !== email) throw reauthFailed();
      const [existing] = await tx
        .select()
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.userId, me.userId),
            inArray(accountDeletionRequests.status, [...live]),
          ),
        )
        .limit(1);
      if (existing) return view(existing);
      const [owned] = await tx
        .select({ boxId: boxMemberships.boxId })
        .from(boxMemberships)
        .where(
          and(
            eq(boxMemberships.userId, me.userId),
            eq(boxMemberships.role, 'owner'),
            eq(boxMemberships.status, 'active'),
          ),
        )
        .limit(1);
      if (owned) throw ownershipRequired();
      const requestedAt = new Date();
      const [row] = await tx
        .insert(accountDeletionRequests)
        .values({
          userId: me.userId,
          requestedAt,
          dueAt: new Date(requestedAt.getTime() + 7 * dayMs),
          nextAttemptAt: new Date(requestedAt.getTime() + 7 * dayMs),
        })
        .returning();
      if (!row) throw deletionNotFound();
      return view(row);
    });
  }

  public async current(userId: string) {
    const [row] = await this.db
      .select()
      .from(accountDeletionRequests)
      .where(
        and(
          eq(accountDeletionRequests.userId, userId),
          inArray(accountDeletionRequests.status, [...live]),
        ),
      )
      .orderBy(desc(accountDeletionRequests.requestedAt))
      .limit(1);
    return { deletion: row ? view(row) : null };
  }

  public async cancel(me: AuthenticatedPrincipal, password: string) {
    await this.verify(me, password);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.userId, me.userId),
            inArray(accountDeletionRequests.status, [...live]),
          ),
        )
        .for('update')
        .limit(1);
      if (!row) throw deletionNotFound();
      const [cancelled] = await tx
        .update(accountDeletionRequests)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(accountDeletionRequests.id, row.id))
        .returning();
      if (!cancelled) throw deletionNotFound();
      return view(cancelled);
    });
  }
}
