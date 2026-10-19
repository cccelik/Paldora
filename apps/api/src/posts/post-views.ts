import type {
  FeedItemView,
  PostInteractionSummary,
  PostMediaView,
  PostView,
  UserSummary,
} from '@paldora/validation';
import type { PostContext } from './post-context.js';

export type { PostContext } from './post-context.js';

export type MediaByPost = ReadonlyMap<string, readonly PostMediaView[]>;
export type InteractionsByPost = ReadonlyMap<string, PostInteractionSummary>;

/** Everything a page of posts shares, gathered once per page. */
export interface PostPageData {
  readonly viewerId: string;
  readonly authors: ReadonlyMap<string, UserSummary>;
  readonly media: MediaByPost;
  readonly interactions: InteractionsByPost;
}

/** Summary for a post whose interactions were not loaded (never shown). */
const noInteractions = (context: PostContext): PostInteractionSummary => ({
  commentCount: 0,
  reactions: [],
  reactionCount: 0,
  realCount: 0,
  realPreview: [],
  viewerReaction: null,
  canInteract: context.boxStatus === 'active',
});

export function toPostView(
  context: PostContext,
  author: UserSummary,
  viewerId: string,
  media: readonly PostMediaView[],
  interactions: PostInteractionSummary = noInteractions(context),
): PostView {
  const { post } = context;
  return {
    id: post.id,
    box: { id: post.boxId, name: context.boxName },
    author,
    content: post.content ?? '',
    media: [...media],
    createdAt: post.createdAt.toISOString(),
    editedAt: post.editedAt?.toISOString() ?? null,
    canEdit: post.authorUserId === viewerId && context.boxStatus === 'active',
    interactions,
  };
}

/**
 * Hidden rows are reduced to an ID, a Box, and a time before they leave the
 * service, so a block can never leak text, photos, or authorship (ADR 013).
 */
export function toFeedItem(
  context: PostContext,
  page: PostPageData,
): FeedItemView | null {
  if (context.hidden) {
    return {
      kind: 'hidden',
      hidden: {
        id: context.post.id,
        boxId: context.post.boxId,
        createdAt: context.post.createdAt.toISOString(),
      },
    };
  }
  const author = page.authors.get(context.post.authorUserId);
  return author
    ? {
        kind: 'post',
        post: toPostView(
          context,
          author,
          page.viewerId,
          page.media.get(context.post.id) ?? [],
          page.interactions.get(context.post.id),
        ),
      }
    : null;
}
