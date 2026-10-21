import { Inject, Injectable } from '@nestjs/common';
import {
  hiddenByBlock,
  mediaAssets,
  postReactions,
  profiles,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import { REAL_REACTION_KIND } from '@paldora/domain';
import type { PostReactionEntry } from '@paldora/validation';
import { and, eq, isNotNull, not } from 'drizzle-orm';
import { ProfileSummaryService } from '../../identity/profile-summary.service.js';
import { MediaUrlService } from '../../media/media-urls.service.js';
import {
  keysetWindow,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
  type PageQuery,
} from '../../platform/pagination/pagination.js';
import { DATABASE } from '../../platform/config/tokens.js';
import { InteractionPolicyService } from '../shared/interaction-policy.service.js';

export interface ReactionPageQuery extends PageQuery {
  readonly kind?: string | undefined;
}

/**
 * Who reacted to a post, newest first, keyset on (created_at, user_id).
 * Only people who may read the post get here; reactors in a block
 * relationship with the viewer are omitted (no placeholder), and camera
 * images are signed only for them, after every authorization check.
 */
@Injectable()
export class ReactionQueryService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(InteractionPolicyService)
    private readonly policy: InteractionPolicyService,
    @Inject(ProfileSummaryService)
    private readonly people: ProfileSummaryService,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
  ) {}

  public async list(
    viewerId: string,
    postId: string,
    query: ReactionPageQuery,
  ): Promise<Page<PostReactionEntry>> {
    await this.policy.postForRead(this.database, viewerId, postId);
    const cursor = decodeCursor(query.cursor);
    const keyset = keysetWindow(
      postReactions.createdAt,
      postReactions.userId,
      cursor,
      'desc',
    );
    const rows = await this.database
      .select({
        userId: postReactions.userId,
        kind: postReactions.kind,
        createdAt: postReactions.createdAt,
        at: cursorTimestamp(postReactions.createdAt),
        asset: {
          id: mediaAssets.id,
          status: mediaAssets.status,
          displayObjectKey: mediaAssets.displayObjectKey,
          thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
        },
      })
      .from(postReactions)
      // Only people with a public face are listed, so pages stay full.
      .innerJoin(users, eq(users.id, postReactions.userId))
      .innerJoin(profiles, eq(profiles.userId, postReactions.userId))
      .leftJoin(mediaAssets, eq(mediaAssets.id, postReactions.mediaAssetId))
      .where(
        and(
          eq(postReactions.postId, postId),
          eq(users.status, 'active'),
          isNotNull(profiles.username),
          not(hiddenByBlock(viewerId, postReactions.userId)),
          query.kind === undefined
            ? undefined
            : eq(postReactions.kind, query.kind),
          keyset.after,
        ),
      )
      .orderBy(...keyset.orderBy)
      .limit(query.limit + 1);
    const visible = rows.slice(0, query.limit);
    const [people, images] = await Promise.all([
      this.people.summaries(visible.map((row) => row.userId)),
      Promise.all(
        visible.map((row) =>
          row.kind === REAL_REACTION_KIND
            ? this.mediaUrls.sign(row.asset)
            : null,
        ),
      ),
    ]);
    const imageOf = new Map(
      visible.map((row, index) => [row.userId, images[index] ?? null]),
    );
    const page = pageOf(
      rows,
      query.limit,
      (row) => ({ at: row.at, id: row.userId }),
      (row) => {
        const user = people.get(row.userId);
        const image = imageOf.get(row.userId);
        if (!user) return null;
        const entry: PostReactionEntry = {
          user,
          kind: row.kind,
          ...(image ? { image } : {}),
          createdAt: row.createdAt.toISOString(),
        };
        return entry;
      },
    );
    return {
      items: page.items.filter((item) => item !== null),
      nextCursor: page.nextCursor,
    };
  }
}
