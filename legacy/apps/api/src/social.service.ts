import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  friendships,
  profiles,
  roomTopFriends,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { Friendship, FriendshipId, UserId } from '@paldora/domain';
import { normalizeUsername } from '@paldora/validation';
import { and, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { isUniqueViolation } from './database-errors.js';
import { InfrastructureService } from './infrastructure.service.js';
import { ProfileAvatarService } from './profile-avatar.service.js';

@Injectable()
export class SocialService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public listFriends(userId: UserId): Promise<Friendship[]> {
    return this.list(userId, 'accepted');
  }

  public listRequests(userId: UserId): Promise<Friendship[]> {
    return this.list(userId, 'pending');
  }

  public listBlocked(userId: UserId): Promise<Friendship[]> {
    return this.list(userId, 'blocked', true);
  }

  public async request(userId: UserId, username: string): Promise<Friendship> {
    const target = await this.profileByUsername(username);
    if (target.userId === userId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_FRIEND_SELF',
        'You cannot send a friend request to yourself.',
      );
    }
    const [low, high] = this.pair(userId, target.userId);
    const [existing] = await this.database
      .select()
      .from(friendships)
      .where(
        and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
      )
      .limit(1);
    this.assertFriendRequestAvailable(existing);
    const row = await this.persistFriendRequest(userId, low, high, existing);
    if (!row) throw new Error('Friend request did not return a row.');
    return this.map(row, userId, target);
  }

  public respond(
    userId: UserId,
    friendshipId: FriendshipId,
    response: 'accepted' | 'declined',
  ): Promise<Friendship> {
    return this.respondToRequest(userId, friendshipId, response);
  }

  public async remove(
    userId: UserId,
    otherUserId: UserId,
  ): Promise<{ success: true }> {
    const [low, high] = this.pair(userId, otherUserId);
    const deleted = await this.database.transaction(async (tx) => {
      const removed = await tx
        .delete(friendships)
        .where(
          and(
            eq(friendships.userLowId, low),
            eq(friendships.userHighId, high),
            eq(friendships.status, 'accepted'),
          ),
        )
        .returning({ id: friendships.id });
      if (removed.length > 0)
        await tx
          .delete(roomTopFriends)
          .where(
            or(
              and(
                eq(roomTopFriends.roomUserId, userId),
                eq(roomTopFriends.friendUserId, otherUserId),
              ),
              and(
                eq(roomTopFriends.roomUserId, otherUserId),
                eq(roomTopFriends.friendUserId, userId),
              ),
            ),
          );
      return removed;
    });
    if (!deleted.length) this.friendshipNotFound();
    return { success: true };
  }

  public async block(userId: UserId, username: string): Promise<Friendship> {
    const target = await this.profileByUsername(username);
    if (target.userId === userId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_BLOCK_SELF',
        'You cannot block yourself.',
      );
    }
    const [low, high] = this.pair(userId, target.userId);
    const now = new Date();
    const row = await this.database.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(friendships)
        .where(
          and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
        )
        .for('update')
        .limit(1);
      if (
        existing?.status === 'blocked' &&
        existing.blockedByUserId !== userId
      ) {
        this.interactionUnavailable();
      }
      const [blocked] = existing
        ? await tx
            .update(friendships)
            .set({
              status: 'blocked',
              blockedByUserId: userId,
              respondedAt: now,
              updatedAt: now,
            })
            .where(eq(friendships.id, existing.id))
            .returning()
        : await tx
            .insert(friendships)
            .values({
              userLowId: low,
              userHighId: high,
              initiatedByUserId: userId,
              blockedByUserId: userId,
              status: 'blocked',
              respondedAt: now,
            })
            .returning();
      await tx
        .delete(roomTopFriends)
        .where(
          or(
            and(
              eq(roomTopFriends.roomUserId, userId),
              eq(roomTopFriends.friendUserId, target.userId),
            ),
            and(
              eq(roomTopFriends.roomUserId, target.userId),
              eq(roomTopFriends.friendUserId, userId),
            ),
          ),
        );
      return blocked;
    });
    if (!row) throw new Error('Block did not return a row.');
    return this.map(row, userId, target);
  }

  public async unblock(
    userId: UserId,
    otherUserId: UserId,
  ): Promise<{ success: true }> {
    const [low, high] = this.pair(userId, otherUserId);
    const deleted = await this.database
      .delete(friendships)
      .where(
        and(
          eq(friendships.userLowId, low),
          eq(friendships.userHighId, high),
          eq(friendships.status, 'blocked'),
          eq(friendships.blockedByUserId, userId),
        ),
      )
      .returning({ id: friendships.id });
    if (!deleted.length) this.friendshipNotFound();
    return { success: true };
  }

  private async respondToRequest(
    userId: UserId,
    friendshipId: FriendshipId,
    response: 'accepted' | 'declined',
  ): Promise<Friendship> {
    const [row] = await this.database
      .update(friendships)
      .set({ status: response, respondedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(friendships.id, friendshipId),
          eq(friendships.status, 'pending'),
          ne(friendships.initiatedByUserId, userId),
          or(
            eq(friendships.userLowId, userId),
            eq(friendships.userHighId, userId),
          ),
        ),
      )
      .returning();
    if (!row) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'FRIEND_REQUEST_NOT_FOUND',
        'That friend request is unavailable.',
      );
    }
    const otherId = (
      row.userLowId === userId ? row.userHighId : row.userLowId
    ) as UserId;
    return this.map(row, userId, await this.profileByUserId(otherId));
  }

  private async list(
    userId: UserId,
    status: 'accepted' | 'pending' | 'blocked',
    onlyBlockedByUser = false,
  ): Promise<Friendship[]> {
    const otherUserId = sql<string>`case
      when ${friendships.userLowId} = ${userId}
      then ${friendships.userHighId}
      else ${friendships.userLowId}
    end`;
    const rows = await this.database
      .select({
        friendship: friendships,
        other: {
          userId: profiles.userId,
          username: profiles.username,
          displayName: profiles.displayName,
        },
      })
      .from(friendships)
      .innerJoin(profiles, eq(profiles.userId, otherUserId))
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          eq(friendships.status, status),
          eq(users.status, 'active'),
          or(
            eq(friendships.userLowId, userId),
            eq(friendships.userHighId, userId),
          ),
          ...(onlyBlockedByUser
            ? [eq(friendships.blockedByUserId, userId)]
            : []),
        ),
      );
    const avatarUrls = await this.avatars.forUsers(
      rows.map(({ other }) => other.userId as UserId),
    );
    return rows.map(({ friendship, other }) =>
      this.map(friendship, userId, {
        userId: other.userId as UserId,
        username: other.username,
        displayName: other.displayName,
        avatarUrl: avatarUrls.get(other.userId as UserId) ?? null,
      }),
    );
  }

  private async profileByUsername(username: string) {
    return this.profileBy(
      eq(profiles.usernameNormalized, normalizeUsername(username)),
    );
  }

  private async profileByUserId(userId: UserId) {
    return this.profileBy(eq(profiles.userId, userId));
  }

  private async profileBy(condition: SQL<unknown>) {
    const [profile] = await this.database
      .select({
        userId: profiles.userId,
        username: profiles.username,
        displayName: profiles.displayName,
      })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(and(condition, eq(users.status, 'active')))
      .limit(1);
    if (!profile) this.userNotFound();
    return {
      userId: profile.userId as UserId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: await this.avatars.forUser(profile.userId as UserId),
    };
  }

  private assertFriendRequestAvailable(
    existing: typeof friendships.$inferSelect | undefined,
  ): void {
    if (existing?.status === 'blocked') this.interactionUnavailable();
    if (existing?.status === 'accepted') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'ALREADY_FRIENDS',
        'You are already friends.',
      );
    }
    if (existing?.status === 'pending') this.friendRequestPending();
  }

  private async persistFriendRequest(
    userId: UserId,
    low: UserId,
    high: UserId,
    existing: typeof friendships.$inferSelect | undefined,
  ): Promise<typeof friendships.$inferSelect | undefined> {
    try {
      const rows = existing
        ? await this.database
            .update(friendships)
            .set({
              initiatedByUserId: userId,
              blockedByUserId: null,
              status: 'pending',
              respondedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(friendships.id, existing.id))
            .returning()
        : await this.database
            .insert(friendships)
            .values({
              userLowId: low,
              userHighId: high,
              initiatedByUserId: userId,
            })
            .returning();
      return rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) this.friendRequestPending();
      throw error;
    }
  }

  private map(
    row: typeof friendships.$inferSelect,
    currentUserId: UserId,
    other: {
      userId: UserId;
      username: string | null;
      displayName: string | null;
      avatarUrl: string | null;
    },
  ): Friendship {
    const direction =
      row.status === 'accepted'
        ? 'established'
        : row.status === 'blocked'
          ? 'blocked'
          : row.initiatedByUserId === currentUserId
            ? 'outgoing'
            : 'incoming';
    return {
      id: row.id as FriendshipId,
      user: {
        id: other.userId,
        username: other.username,
        displayName: other.displayName,
        avatarUrl: other.avatarUrl,
      },
      status: row.status,
      direction,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private pair(first: UserId, second: UserId): [UserId, UserId] {
    return first < second ? [first, second] : [second, first];
  }

  private userNotFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'USER_NOT_FOUND',
      'No person with that username was found.',
    );
  }

  private friendshipNotFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'FRIENDSHIP_NOT_FOUND',
      'That friendship is unavailable.',
    );
  }

  private friendRequestPending(): never {
    throw new ApiError(
      HttpStatus.CONFLICT,
      'FRIEND_REQUEST_ALREADY_PENDING',
      'A friend request is already pending.',
    );
  }

  private interactionUnavailable(): never {
    throw new ApiError(
      HttpStatus.FORBIDDEN,
      'INTERACTION_NOT_AVAILABLE',
      'This interaction is not available.',
    );
  }
}
