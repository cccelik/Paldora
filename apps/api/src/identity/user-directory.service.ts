import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  profiles,
  userBlocks,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import { normalizeUsername } from '@paldora/validation';
import { and, eq, isNotNull } from 'drizzle-orm';
import { defineError } from '../platform/http/api-error.js';
import { DATABASE } from '../platform/config/tokens.js';

export const userNotFound = defineError(
  HttpStatus.NOT_FOUND,
  'USER_NOT_FOUND',
  'No one with that username was found.',
);

export const userBlocked = defineError(
  HttpStatus.FORBIDDEN,
  'USER_BLOCKED',
  'You blocked this person. Unblock them first.',
);

/** Finds people by username for actions that target someone (ADR 013). */
@Injectable()
export class UserDirectoryService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
  ) {}

  /** An active person with this username, or null. Ignores blocks. */
  public async findByUsername(username: string): Promise<string | null> {
    const [row] = await this.database
      .select({ id: users.id })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          eq(profiles.usernameNormalized, normalizeUsername(username)),
          isNotNull(profiles.username),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * Resolves a username for an action that reaches out to that person
   * (friend request, Box invitation).
   *
   * - If the viewer blocked them: `USER_BLOCKED`. The viewer knows this.
   * - If they blocked the viewer: `USER_NOT_FOUND`, identical to a username
   *   that does not exist, so a block can never be detected from outside.
   */
  public async resolveForOutreach(
    viewerId: string,
    username: string,
  ): Promise<string> {
    const targetId = await this.findByUsername(username);
    if (!targetId) throw userNotFound();
    const blocks = await this.database
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerId, viewerId),
          eq(userBlocks.blockedId, targetId),
        ),
      )
      .limit(1);
    if (blocks.length > 0) throw userBlocked();
    const reverse = await this.database
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerId, targetId),
          eq(userBlocks.blockedId, viewerId),
        ),
      )
      .limit(1);
    if (reverse.length > 0) throw userNotFound();
    return targetId;
  }
}
