import {
  boxMemberships,
  boxes,
  hiddenByBlock,
  posts,
  type DatabaseExecutor,
  type PostRow,
} from '@paldora/database';
import type { BoxStatus } from '@paldora/domain';
import { and, eq } from 'drizzle-orm';

/**
 * A post as one viewer relates to it. Interactions build on this, so it
 * lives apart from the posts services: importing it never creates a module
 * cycle.
 */
export interface PostContext {
  readonly post: PostRow;
  readonly boxName: string;
  readonly boxStatus: BoxStatus;
  /** A block exists between the viewer and the author (either direction). */
  readonly hidden: boolean;
}

/**
 * A post with the viewer's active membership in its Box, in one query;
 * undefined when they have none. Callers decide what `hidden` and a deleted
 * post mean for them, always answering POST_NOT_FOUND for both.
 */
export async function loadPostContext(
  executor: DatabaseExecutor,
  viewerId: string,
  postId: string,
): Promise<PostContext | undefined> {
  const [row] = await executor
    .select({
      post: posts,
      boxName: boxes.name,
      boxStatus: boxes.status,
      hidden: hiddenByBlock(viewerId, posts.authorUserId).mapWith(Boolean),
    })
    .from(posts)
    .innerJoin(boxes, eq(boxes.id, posts.boxId))
    .innerJoin(
      boxMemberships,
      and(
        eq(boxMemberships.boxId, posts.boxId),
        eq(boxMemberships.userId, viewerId),
        eq(boxMemberships.status, 'active'),
      ),
    )
    .where(eq(posts.id, postId))
    .limit(1);
  return row;
}

/** Visible, active, and the viewer belongs to its Box. */
export const isReadable = (
  context: PostContext | undefined,
): context is PostContext =>
  context !== undefined && !context.hidden && context.post.status === 'active';
