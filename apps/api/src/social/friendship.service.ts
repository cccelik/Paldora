import { Inject, Injectable } from '@nestjs/common';
import {
  friendships,
  hiddenByBlock,
  isBlockedBetween,
  lockPair,
  orderedPair,
  profiles,
  users,
  type FriendshipRow,
  type PaldoraDatabase,
} from '@paldora/database';
import type { FriendshipDirection } from '@paldora/domain';
import type { FriendshipView, UserSummary } from '@paldora/validation';
import { and, desc, eq, isNotNull, not, or, sql } from 'drizzle-orm';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import {
  userNotFound,
  UserDirectoryService,
} from '../identity/user-directory.service.js';
import { isUniqueViolation } from '../platform/database-errors.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import {
  afterCursor,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
} from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import {
  alreadyFriends,
  cannotFriendSelf,
  friendRequestNotFound,
  friendshipNotFound,
  requestAlreadyPending,
} from './social-errors.js';

export interface PageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

function directionOf(
  row: FriendshipRow,
  viewerId: string,
): FriendshipDirection {
  if (row.status === 'accepted') return 'established';
  return row.initiatedByUserId === viewerId ? 'outgoing' : 'incoming';
}

function toView(
  row: FriendshipRow,
  viewerId: string,
  user: UserSummary,
): FriendshipView {
  return {
    id: row.id,
    user,
    status: row.status === 'accepted' ? 'accepted' : 'pending',
    direction: directionOf(row, viewerId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const otherPartyOf = (row: FriendshipRow, viewerId: string): string =>
  row.userLowId === viewerId ? row.userHighId : row.userLowId;

@Injectable()
export class FriendshipService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(UserDirectoryService)
    private readonly directory: UserDirectoryService,
    @Inject(ProfileSummaryService)
    private readonly summaries: ProfileSummaryService,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  public friends(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<FriendshipView>> {
    return this.page(viewerId, 'accepted', query);
  }

  public requests(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<FriendshipView>> {
    return this.page(viewerId, 'pending', query);
  }

  /**
   * A person-to-person row is shown only while the other person is active, has
   * a username, and no block exists in either direction.
   */
  private async page(
    viewerId: string,
    status: 'accepted' | 'pending',
    query: PageQuery,
  ): Promise<Page<FriendshipView>> {
    const otherId = sql<string>`case when ${friendships.userLowId} = ${viewerId}::uuid
      then ${friendships.userHighId} else ${friendships.userLowId} end`;
    const rows = await this.database
      .select({
        friendship: friendships,
        otherId,
        cursorAt: cursorTimestamp(friendships.updatedAt),
      })
      .from(friendships)
      .innerJoin(users, sql`${users.id} = ${otherId}`)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(
        and(
          eq(friendships.status, status),
          or(
            eq(friendships.userLowId, viewerId),
            eq(friendships.userHighId, viewerId),
          ),
          eq(users.status, 'active'),
          isNotNull(profiles.username),
          not(hiddenByBlock(viewerId, users.id)),
          afterCursor(
            friendships.updatedAt,
            friendships.id,
            decodeCursor(query.cursor),
            'desc',
          ),
        ),
      )
      .orderBy(desc(friendships.updatedAt), desc(friendships.id))
      .limit(query.limit + 1);
    const people = await this.summaries.summaries(
      rows.map((row) => row.otherId),
    );
    const present = rows.filter((row) => people.has(row.otherId));
    return pageOf(
      present,
      query.limit,
      (row) => ({ at: row.cursorAt, id: row.friendship.id }),
      (row) =>
        toView(
          row.friendship,
          viewerId,
          people.get(row.otherId) as UserSummary,
        ),
    );
  }

  /**
   * Sends a request. Re-asking after a decline is allowed; the per-hour rate
   * limit on the route bounds it. Blocks are checked inside the pair lock, so
   * a block that lands first always wins.
   */
  public async request(
    viewerId: string,
    username: string,
  ): Promise<FriendshipView> {
    const targetId = await this.directory.resolveForOutreach(
      viewerId,
      username,
    );
    if (targetId === viewerId) throw cannotFriendSelf();
    const [low, high] = orderedPair(viewerId, targetId);
    const row = await this.database
      .transaction(async (transaction) => {
        await lockPair(transaction, viewerId, targetId);
        if (await isBlockedBetween(transaction, viewerId, targetId)) {
          throw userNotFound();
        }
        const [existing] = await transaction
          .select()
          .from(friendships)
          .where(
            and(
              eq(friendships.userLowId, low),
              eq(friendships.userHighId, high),
            ),
          )
          .for('update')
          .limit(1);
        if (existing?.status === 'accepted') throw alreadyFriends();
        if (existing?.status === 'pending') throw requestAlreadyPending();
        const [saved] = existing
          ? await transaction
              .update(friendships)
              .set({
                status: 'pending',
                initiatedByUserId: viewerId,
                respondedAt: null,
                updatedAt: new Date(),
              })
              .where(eq(friendships.id, existing.id))
              .returning()
          : await transaction
              .insert(friendships)
              .values({
                userLowId: low,
                userHighId: high,
                initiatedByUserId: viewerId,
              })
              .returning();
        return saved;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw requestAlreadyPending();
        throw error;
      });
    if (!row) throw new Error('Friend request returned no row.');
    return this.view(row, viewerId);
  }

  /** Answers a request someone else sent. Accepting returns the friendship. */
  public async respond(
    viewerId: string,
    friendshipId: string,
    accept: boolean,
  ): Promise<FriendshipRow> {
    const row = await this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select()
        .from(friendships)
        .where(eq(friendships.id, friendshipId))
        .limit(1);
      if (!candidate || !this.isIncoming(candidate, viewerId)) {
        throw friendRequestNotFound();
      }
      await lockPair(transaction, candidate.userLowId, candidate.userHighId);
      const [current] = await transaction
        .select()
        .from(friendships)
        .where(eq(friendships.id, friendshipId))
        .for('update')
        .limit(1);
      if (
        !current ||
        !this.isIncoming(current, viewerId) ||
        (await isBlockedBetween(
          transaction,
          viewerId,
          otherPartyOf(current, viewerId),
        ))
      ) {
        throw friendRequestNotFound();
      }
      const [updated] = await transaction
        .update(friendships)
        .set({
          status: accept ? 'accepted' : 'declined',
          respondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(friendships.id, friendshipId))
        .returning();
      return updated;
    });
    if (!row) throw friendRequestNotFound();
    return row;
  }

  public async accept(
    viewerId: string,
    friendshipId: string,
  ): Promise<FriendshipView> {
    return this.view(
      await this.respond(viewerId, friendshipId, true),
      viewerId,
    );
  }

  public async decline(viewerId: string, friendshipId: string): Promise<void> {
    await this.respond(viewerId, friendshipId, false);
  }

  /** Withdraws a request the viewer sent. */
  public async cancel(viewerId: string, friendshipId: string): Promise<void> {
    const removed = await this.database
      .delete(friendships)
      .where(
        and(
          eq(friendships.id, friendshipId),
          eq(friendships.status, 'pending'),
          eq(friendships.initiatedByUserId, viewerId),
        ),
      )
      .returning({ id: friendships.id });
    if (removed.length === 0) throw friendRequestNotFound();
  }

  public async remove(viewerId: string, otherUserId: string): Promise<void> {
    const [low, high] = orderedPair(viewerId, otherUserId);
    const removed = await this.database
      .delete(friendships)
      .where(
        and(
          eq(friendships.userLowId, low),
          eq(friendships.userHighId, high),
          eq(friendships.status, 'accepted'),
        ),
      )
      .returning({ id: friendships.id });
    if (removed.length === 0) throw friendshipNotFound();
  }

  private isIncoming(row: FriendshipRow, viewerId: string): boolean {
    return (
      row.status === 'pending' &&
      row.initiatedByUserId !== viewerId &&
      (row.userLowId === viewerId || row.userHighId === viewerId)
    );
  }

  private async view(
    row: FriendshipRow,
    viewerId: string,
  ): Promise<FriendshipView> {
    const otherId = otherPartyOf(row, viewerId);
    const person = (await this.summaries.summaries([otherId])).get(otherId);
    if (!person) throw userNotFound();
    return toView(row, viewerId, person);
  }
}
