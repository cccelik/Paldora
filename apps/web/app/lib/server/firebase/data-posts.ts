import { ApiClientError, type PageOptions } from '@/lib/server/web-data-error';
import { LIFE_UPDATE_SECTION_KEYS } from '@paldora/domain';
import {
  NativePostError,
  NativeLifeUpdateError,
  NativeHomeFeed,
  NativeHomeFeedError,
  type NativeBoxPosts,
} from '@paldora/firebase-trusted';
import { type PostReactionEntry } from '@paldora/validation';
import { firebaseLocalWebUrl } from './mode';
import {
  unavailable,
  iso,
  precomputed,
  type FirebaseFeedItem,
  type SummaryLookup,
} from './data-views';
import type { WebDataContext } from './data-context';
import 'server-only';

/** Posts, reactions and the home feed. */
export class PostsData {
  public constructor(private readonly ctx: WebDataContext) {}

  /** `summaries` is the page's precomputed lookup; omitted for a single post. */
  private async feedItem(
    post: Awaited<ReturnType<NativeBoxPosts['get']>>,
    summaries?: SummaryLookup,
  ): Promise<FirebaseFeedItem | null> {
    const interactions = () =>
      summaries
        ? Promise.resolve(precomputed(summaries, post.id))
        : this.ctx.summary(post.boxId, post.id);
    if (post.kind === 'life_update') {
      if (!post.lifeUpdateId) return null;
      try {
        const update = await this.ctx.lifeUpdatesService.get(
          post.lifeUpdateId,
          this.ctx.uid,
          post.boxId,
        );
        if (!update.contexts.some((context) => context.postId === post.id))
          return null;
        return {
          kind: 'life_update',
          id: update.id,
          boxId: post.boxId,
          postId: post.id,
          authorName: await this.ctx.authorName(update.authorUid),
          authorAvatarUrl: await this.ctx.authorAvatarUrl(update.authorUid),
          mediaAssetIds: update.mediaAssetIds,
          createdAt: iso(update.createdAt),
          interactions: await interactions(),
          sections: LIFE_UPDATE_SECTION_KEYS.flatMap((key) =>
            update.sections[key]
              ? [{ key, content: update.sections[key] }]
              : [],
          ),
        };
      } catch (error) {
        if (
          error instanceof NativeLifeUpdateError &&
          error.code === 'UNAVAILABLE'
        )
          return null;
        throw error;
      }
    }
    return {
      kind: 'post',
      id: post.id,
      boxId: post.boxId,
      authorName: await this.ctx.authorName(post.authorUid),
      authorAvatarUrl: await this.ctx.authorAvatarUrl(post.authorUid),
      content: post.text,
      mediaAssetIds: post.mediaAssetIds,
      createdAt: iso(post.createdAt),
      edited: post.updatedAt > post.createdAt,
      canEdit: post.authorUid === this.ctx.uid,
      interactions: await interactions(),
    };
  }

  public async boxPosts(boxId: string, page: PageOptions = {}) {
    try {
      const result = await this.ctx.postsService.list(
        boxId,
        this.ctx.uid,
        page.cursor,
        page.limit,
      );
      const summaries = await this.ctx.summariesFor(
        result.items.map((post) => ({ boxId: post.boxId, postId: post.id })),
      );
      const projected = await Promise.all(
        result.items.map((post) => this.feedItem(post, summaries)),
      );
      return {
        items: projected.filter(
          (item): item is FirebaseFeedItem => item !== null,
        ),
        nextCursor: result.nextCursor,
      };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('BOX_NOT_FOUND');
      throw error;
    }
  }

  public postInteractionSummary(boxId: string, postId: string) {
    return this.ctx.summary(boxId, postId);
  }

  public async postReactions(
    postId: string,
    page: PageOptions = {},
    cameraOnly = false,
  ) {
    try {
      const resolved = await this.ctx.postsService.resolve(
        postId,
        this.ctx.uid,
      );
      const result = await this.ctx.postsService.listReactions(
        resolved.post.boxId,
        postId,
        this.ctx.uid,
        undefined,
        page.cursor,
      );
      const items: PostReactionEntry[] = await Promise.all(
        result.items
          .filter((reaction) => !cameraOnly || reaction.kind === 'real')
          .map(async (reaction) => ({
            user: await this.ctx.personView(reaction.uid),
            kind: reaction.kind,
            ...(reaction.mediaAssetId
              ? {
                  image: {
                    url: `${firebaseLocalWebUrl()}/media/${reaction.mediaAssetId}/display`,
                    thumbnailUrl: `${firebaseLocalWebUrl()}/media/${reaction.mediaAssetId}/thumbnail`,
                  },
                }
              : {}),
            createdAt: iso(reaction.createdAt),
          })),
      );
      return { items, nextCursor: result.nextCursor };
    } catch (error) {
      if (error instanceof NativePostError) throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  public async homeFeed(page: PageOptions = {}) {
    try {
      // Repair a bounded amount of durable fanout/backfill work on local reads.
      await this.ctx.homeFeedService.processPending();
      const result = await this.ctx.homeFeedService.page(
        this.ctx.uid,
        page.cursor,
        page.limit ?? 20,
      );
      const summaries = await this.ctx.summariesFor(
        result.items.map((post) => ({ boxId: post.boxId, postId: post.id })),
      );
      const projected = await Promise.all(
        result.items.map((post) => this.feedItem(post, summaries)),
      );
      return {
        items: projected.filter(
          (item): item is FirebaseFeedItem => item !== null,
        ),
        nextCursor: result.nextCursor,
      };
    } catch (error) {
      if (error instanceof NativeHomeFeedError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'INVALID_CURSOR',
          'Invalid feed page.',
          null,
        );
      if (error instanceof NativeHomeFeedError && error.code === 'UNAVAILABLE')
        throw unavailable('ACCOUNT_NOT_FOUND');
      throw error;
    }
  }

  public async post(postId: string) {
    try {
      const { post } = await this.ctx.postsService.resolve(
        postId,
        this.ctx.uid,
      );
      const [box, item] = await Promise.all([
        this.ctx.box(post.boxId),
        this.feedItem(post),
      ]);
      if (!item) throw unavailable('POST_NOT_FOUND');
      return { box, item };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  public async createPost(
    boxId: string,
    body: { content: string; mediaAssetIds: string[] },
  ) {
    try {
      const id = await this.ctx.postsService.create(
        boxId,
        this.ctx.uid,
        body.content,
        Date.now(),
        body.mediaAssetIds,
      );
      // Publication is already committed; a failed projection remains retryable.
      await this.ctx.homeFeedService
        .processOnce(NativeHomeFeed.publishJobId(id))
        .catch(() => undefined);
      return id;
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('BOX_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Write something before posting.',
          null,
        );
      throw error;
    }
  }

  public async updatePost(postId: string, body: { content: string }) {
    try {
      const { post, kind } = await this.ctx.postsService.resolve(
        postId,
        this.ctx.uid,
      );
      if (kind !== 'post') throw unavailable('POST_NOT_FOUND');
      return await this.ctx.postsService.edit(
        post.boxId,
        postId,
        this.ctx.uid,
        body.content,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Write something before saving.',
          null,
        );
      throw error;
    }
  }

  public async deletePost(postId: string) {
    try {
      const { post, kind } = await this.ctx.postsService.resolve(
        postId,
        this.ctx.uid,
      );
      if (kind !== 'post') throw unavailable('POST_NOT_FOUND');
      const mediaIds = await this.ctx.postsService.remove(
        post.boxId,
        postId,
        this.ctx.uid,
      );
      await Promise.all(mediaIds.map((id) => this.ctx.mediaService.retire(id)));
      await this.ctx.drainMediaPostCleanup(postId);
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  public async setPostReaction(
    boxId: string,
    postId: string,
    kind: string | null,
    mediaAssetId?: string,
  ) {
    try {
      const previousMediaId = await this.ctx.postsService.setReaction(
        boxId,
        postId,
        this.ctx.uid,
        kind,
        mediaAssetId ? { mediaAssetId } : undefined,
      );
      if (previousMediaId) await this.ctx.mediaService.retire(previousMediaId);
      return { kind };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Choose one emoji.',
          null,
        );
      throw error;
    }
  }
}
