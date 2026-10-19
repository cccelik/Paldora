import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  friendships,
  profiles,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { BoxId, UserId } from '@paldora/domain';
import { normalizeUsername } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';

@Injectable()
export class BoxAuthorizationPolicy {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async requireMembership(userId: UserId, boxId: BoxId) {
    const [membership] = await this.database
      .select()
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!membership) this.notFound();
    return membership;
  }

  public async requireInteractionAllowed(
    first: UserId,
    second: UserId,
  ): Promise<void> {
    const low = first < second ? first : second;
    const high = first < second ? second : first;
    const [friendship] = await this.database
      .select({ status: friendships.status })
      .from(friendships)
      .where(
        and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
      )
      .limit(1);
    if (friendship?.status === 'blocked') {
      this.forbidden('This interaction is not available.');
    }
  }

  public async userByUsername(username: string): Promise<{ userId: UserId }> {
    const [profile] = await this.database
      .select({ userId: profiles.userId })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          eq(profiles.usernameNormalized, normalizeUsername(username)),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    if (!profile) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'No person with that username was found.',
      );
    }
    return { userId: profile.userId as UserId };
  }

  public notFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'BOX_NOT_FOUND',
      'That Box is unavailable.',
    );
  }

  public forbidden(message: string): never {
    throw new ApiError(HttpStatus.FORBIDDEN, 'BOX_ACCESS_DENIED', message);
  }

  public memberNotFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'BOX_MEMBER_NOT_FOUND',
      'That member is unavailable.',
    );
  }
}
