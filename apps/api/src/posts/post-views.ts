import type { PostRow } from '@paldora/database';
import type { BoxStatus } from '@paldora/domain';
import type {
  FeedItemView,
  PostMediaView,
  PostView,
  UserSummary,
} from '@paldora/validation';

export interface PostContext {
  readonly post: PostRow;
  readonly boxName: string;
  readonly boxStatus: BoxStatus;
  /** A block exists between the viewer and the author (either direction). */
  readonly hidden: boolean;
}

export type MediaByPost = ReadonlyMap<string, readonly PostMediaView[]>;

export function toPostView(
  context: PostContext,
  author: UserSummary,
  viewerId: string,
  media: readonly PostMediaView[],
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
  };
}

/**
 * Hidden rows are reduced to an ID, a Box, and a time before they leave the
 * service, so a block can never leak text, photos, or authorship (ADR 013).
 */
export function toFeedItem(
  context: PostContext,
  authors: ReadonlyMap<string, UserSummary>,
  mediaByPost: MediaByPost,
  viewerId: string,
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
  const author = authors.get(context.post.authorUserId);
  return author
    ? {
        kind: 'post',
        post: toPostView(
          context,
          author,
          viewerId,
          mediaByPost.get(context.post.id) ?? [],
        ),
      }
    : null;
}
