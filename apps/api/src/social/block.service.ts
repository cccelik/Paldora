import { Inject, Injectable } from '@nestjs/common';
import {
  friendships,
  lockPair,
  orderedPair,
  profiles,
  userBlocks,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { BlockedUserView } from '@paldora/validation';
import { and, eq, isNotNull } from 'drizzle-orm';
import { BoxInvitationService } from '../boxes/box-invitation.service.js';
import {
  UserDirectoryService,
  userNotFound,
} from '../identity/user-directory.service.js';
import {
  keysetWindow,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
  type PageQuery,
} from '../platform/pagination/pagination.js';
import { DATABASE } from '../platform/config/tokens.js';
import { cannotBlockSelf } from './social-errors.js';

@Injectable()
export class BlockService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(UserDirectoryService)
    private readonly directory: UserDirectoryService,
    @Inject(BoxInvitationService)
    private readonly boxInvitations: BoxInvitationService,
  ) {}

  /** Only the blocker's own blocks are ever listed. */
  public async list(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<BlockedUserView>> {
    const keyset = keysetWindow(
      userBlocks.createdAt,
      userBlocks.blockedId,
      decodeCursor(query.cursor),
      'desc',
    );
    const rows = await this.database
      .select({
        block: userBlocks,
        username: profiles.username,
        displayName: profiles.displayName,
        cursorAt: cursorTimestamp(userBlocks.createdAt),
      })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(
        and(
          eq(userBlocks.blockerId, viewerId),
          isNotNull(profiles.username),
          keyset.after,
        ),
      )
      .orderBy(...keyset.orderBy)
      .limit(query.limit + 1);
    return pageOf(
      rows,
      query.limit,
      (row) => ({ at: row.cursorAt, id: row.block.blockedId }),
      (row) => ({
        userId: row.block.blockedId,
        username: row.username ?? '',
        displayName: row.displayName ?? row.username ?? '',
        blockedAt: row.block.createdAt.toISOString(),
      }),
    );
  }

  /**
   * One transaction, under the pair lock: record the block, end any
   * friendship or request, and withdraw Box invitations between the two.
   * Shared Boxes stay intact (D1); only what each sees of the other changes.
   * Idempotent, and a block the other person already placed is unaffected.
   */
  public async create(
    viewerId: string,
    username: string,
  ): Promise<BlockedUserView> {
    const targetId = await this.directory.findByUsername(username);
    if (!targetId) throw userNotFound();
    if (targetId === viewerId) throw cannotBlockSelf();
    const [low, high] = orderedPair(viewerId, targetId);
    await this.database.transaction(async (transaction) => {
      await lockPair(transaction, viewerId, targetId);
      await transaction
        .insert(userBlocks)
        .values({ blockerId: viewerId, blockedId: targetId })
        .onConflictDoNothing();
      await transaction
        .delete(friendships)
        .where(
          and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
        );
      await this.boxInvitations.revokePendingBetween(
        transaction,
        viewerId,
        targetId,
      );
    });
    const [row] = await this.database
      .select({
        blockedAt: userBlocks.createdAt,
        username: profiles.username,
        displayName: profiles.displayName,
      })
      .from(userBlocks)
      .innerJoin(profiles, eq(profiles.userId, userBlocks.blockedId))
      .where(
        and(
          eq(userBlocks.blockerId, viewerId),
          eq(userBlocks.blockedId, targetId),
        ),
      )
      .limit(1);
    if (!row) throw userNotFound();
    return {
      userId: targetId,
      username: row.username ?? '',
      displayName: row.displayName ?? row.username ?? '',
      blockedAt: row.blockedAt.toISOString(),
    };
  }

  /** Removes only the viewer's block; one the other person placed stays. */
  public async remove(viewerId: string, blockedId: string): Promise<void> {
    await this.database
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerId, viewerId),
          eq(userBlocks.blockedId, blockedId),
        ),
      );
  }
}
