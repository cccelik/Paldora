import { Inject, Injectable } from '@nestjs/common';
import { mediaAssets, postMedia } from '@paldora/database';
import type { BoxStatus } from '@paldora/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import { InteractionSummaryService } from '../interactions/interaction-summary.service.js';
import { MediaUrlService } from '../media/media-urls.service.js';
import { signPhotos } from '../media/signed-photos.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import type { MediaByPost, PostPageData } from './post-views.js';

/** What a page needs to know about each ordinary post it shows. */
export interface PagePost {
  readonly id: string;
  readonly authorUserId: string;
  readonly boxStatus: BoxStatus;
}

export type OrdinaryPageData = Omit<PostPageData, 'viewerId' | 'lifeUpdates'>;

/**
 * Display data for ordinary posts the caller has already authorized:
 * authors, signed photos, and interaction summaries, in three batched
 * queries whatever the number of posts. Hidden (blocked) posts are never
 * passed in, so nothing is signed or counted for them.
 */
@Injectable()
export class PostPageService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(ProfileSummaryService)
    private readonly summaries: ProfileSummaryService,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
    @Inject(InteractionSummaryService)
    private readonly interactions: InteractionSummaryService,
  ) {}

  public async forPosts(
    viewerId: string,
    pagePosts: readonly PagePost[],
  ): Promise<OrdinaryPageData> {
    const [authors, media, interactions] = await Promise.all([
      this.summaries.summaries(pagePosts.map((post) => post.authorUserId)),
      this.mediaFor(pagePosts.map((post) => post.id)),
      this.interactions.forPosts(
        viewerId,
        pagePosts.map((post) => ({ id: post.id, boxStatus: post.boxStatus })),
      ),
    ]);
    return { authors, media, interactions };
  }

  /** Signed URLs for the ready photos of already-authorized posts. */
  private async mediaFor(postIds: readonly string[]): Promise<MediaByPost> {
    if (postIds.length === 0) return new Map();
    const rows = await this.infrastructure.database
      .select({ postId: postMedia.postId, asset: mediaAssets })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaAssetId))
      .where(
        and(
          inArray(postMedia.postId, [...postIds]),
          eq(mediaAssets.status, 'ready'),
        ),
      )
      .orderBy(asc(postMedia.postId), asc(postMedia.position));
    return signPhotos(
      this.mediaUrls,
      rows.map(({ postId, asset }) => ({ ownerId: postId, asset })),
    );
  }
}
