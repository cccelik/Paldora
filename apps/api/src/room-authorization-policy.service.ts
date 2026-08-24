import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  friendships,
  profiles,
  rooms,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { RoomViewerRelationship, UserId } from '@paldora/domain';
import { normalizeUsername } from '@paldora/validation';
import { and, eq, or } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';

export interface AuthorizedRoom {
  room: typeof rooms.$inferSelect;
  profile: typeof profiles.$inferSelect;
  relationship: RoomViewerRelationship;
}

@Injectable()
export class RoomAuthorizationPolicy {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async requireVisible(
    viewerUserId: UserId,
    username: string,
  ): Promise<AuthorizedRoom> {
    const [target] = await this.database
      .select({ room: rooms, profile: profiles })
      .from(rooms)
      .innerJoin(profiles, eq(profiles.userId, rooms.userId))
      .innerJoin(users, eq(users.id, rooms.userId))
      .where(
        and(
          eq(profiles.usernameNormalized, normalizeUsername(username)),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);
    if (!target) this.notFound();
    if (target.room.userId === viewerUserId) {
      return { ...target, relationship: 'owner' };
    }
    const [relationship] = await this.database
      .select({ status: friendships.status })
      .from(friendships)
      .where(
        or(
          and(
            eq(friendships.userLowId, viewerUserId),
            eq(friendships.userHighId, target.room.userId),
          ),
          and(
            eq(friendships.userHighId, viewerUserId),
            eq(friendships.userLowId, target.room.userId),
          ),
        ),
      )
      .limit(1);
    if (relationship?.status === 'blocked') this.notFound();
    const accepted = relationship?.status === 'accepted';
    if (target.room.visibility === 'hidden') this.notFound();
    if (target.room.visibility === 'friends' && !accepted) this.notFound();
    return {
      ...target,
      relationship: accepted ? 'friend' : 'member',
    };
  }

  public notFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'ROOM_NOT_FOUND',
      'That Room is unavailable.',
    );
  }
}
