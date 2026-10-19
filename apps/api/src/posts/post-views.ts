import type { PostRow } from '@paldora/database';
import type { BoxStatus } from '@paldora/domain';
import type { FeedItemView, PostView, UserSummary } from '@paldora/validation';

export interface PostContext {
  readonly post: PostRow;
  readonly boxName: string;
  readonly boxStatus: BoxStatus;
  /** A block exists between the viewer and the author (either direction). */
  readonly hidden: boolean;
}

export function toPostView(
  context: PostContext,
  author: UserSummary,
  viewerId: string,
): PostView {
  const { post } = context;
  return {
    id: post.id,
    box: { id: post.boxId, name: context.boxName },
    author,
    content: post.content ?? '',
    createdAt: post.createdAt.toISOString(),
    editedAt: post.editedAt?.toISOString() ?? null,
    canEdit: post.authorUserId === viewerId && context.boxStatus === 'active',
  };
}

/**
 * Hidden rows are reduced to an ID, a Box, and a time before they leave the
 * service, so a block can never leak text or authorship (ADR 013).
 */
export function toFeedItem(
  context: PostContext,
  authors: ReadonlyMap<string, UserSummary>,
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
    ? { kind: 'post', post: toPostView(context, author, viewerId) }
    : null;
}
