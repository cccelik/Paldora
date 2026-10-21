import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { users, type PaldoraDatabase } from '@paldora/database';
import type {
  AuthenticatedPrincipal,
  UserId,
  VerifiedIdentity,
} from '@paldora/domain';
import { eq } from 'drizzle-orm';
import { defineError } from '../http/api-error.js';
import { DATABASE } from '../config/tokens.js';

export interface PrincipalResolver {
  /**
   * Maps a verified identity to an active, provisioned user, or throws
   * `ACCOUNT_NOT_PROVISIONED` / `ACCOUNT_BLOCKED`.
   */
  resolve(identity: VerifiedIdentity): Promise<AuthenticatedPrincipal>;
}

export const accountNotProvisioned = defineError(
  HttpStatus.FORBIDDEN,
  'ACCOUNT_NOT_PROVISIONED',
  'This account has not been set up for Paldora.',
);

export const accountBlocked = defineError(
  HttpStatus.FORBIDDEN,
  'ACCOUNT_BLOCKED',
  'This account is not available.',
);

/**
 * One indexed lookup per request. Status is read fresh every time, so a
 * suspension takes effect on the next request rather than at token expiry.
 */
@Injectable()
export class DatabasePrincipalResolver implements PrincipalResolver {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
  ) {}

  public async resolve(
    identity: VerifiedIdentity,
  ): Promise<AuthenticatedPrincipal> {
    const [user] = await this.database
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.authSubject, identity.subject))
      .limit(1);
    if (!user) throw accountNotProvisioned();
    if (user.status !== 'active') throw accountBlocked();
    return { ...identity, userId: user.id as UserId };
  }
}
