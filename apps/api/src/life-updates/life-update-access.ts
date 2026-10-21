import {
  activeMembership,
  boxMemberships,
  boxes,
  lifeUpdateDeliveries,
  posts,
  type DatabaseExecutor,
  type LifeUpdateRow,
} from '@paldora/database';
import type { BoxStatus } from '@paldora/domain';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * One delivery the viewer can reach: its Box is one they belong to right
 * now, and its backing post is active. This is the only definition of a
 * viewer's Life Update contexts; every read and write builds on it.
 */
export interface AccessibleContext {
  readonly lifeUpdateId: string;
  readonly postId: string;
  readonly boxId: string;
  readonly boxName: string;
  readonly boxStatus: BoxStatus;
}

/**
 * The viewer's contexts for many Life Updates in one query. The join on the
 * viewer's active membership is what keeps other Boxes out of every
 * response; `scopeBoxId` narrows a Box feed or Box Memories to that Box.
 */
export async function loadContexts(
  executor: DatabaseExecutor,
  viewerId: string,
  lifeUpdateIds: readonly string[],
  scopeBoxId?: string,
): Promise<AccessibleContext[]> {
  if (lifeUpdateIds.length === 0) return [];
  return executor
    .select({
      lifeUpdateId: lifeUpdateDeliveries.lifeUpdateId,
      postId: posts.id,
      boxId: boxes.id,
      boxName: boxes.name,
      boxStatus: boxes.status,
    })
    .from(lifeUpdateDeliveries)
    .innerJoin(
      posts,
      and(
        eq(posts.id, lifeUpdateDeliveries.postId),
        eq(posts.status, 'active'),
        eq(posts.moderationHidden, false),
      ),
    )
    .innerJoin(boxes, eq(boxes.id, lifeUpdateDeliveries.boxId))
    .innerJoin(
      boxMemberships,
      activeMembership(lifeUpdateDeliveries.boxId, viewerId),
    )
    .where(
      and(
        inArray(lifeUpdateDeliveries.lifeUpdateId, [...lifeUpdateIds]),
        scopeBoxId ? eq(lifeUpdateDeliveries.boxId, scopeBoxId) : undefined,
      ),
    );
}

/**
 * Visible: active, no block between the viewer and the author (either
 * direction), and either the viewer's own Only Me update or reachable
 * through at least one of the viewer's Boxes. Access is "active membership
 * right now", for the author too.
 */
export function isVisible(
  update: Pick<LifeUpdateRow, 'status' | 'audience' | 'authorUserId'>,
  hidden: boolean,
  viewerId: string,
  contextCount: number,
): boolean {
  if (update.status !== 'active' || hidden) return false;
  if (update.audience === 'only_me') return update.authorUserId === viewerId;
  return contextCount > 0;
}

/** The author may change it while it is Only Me or one of its Boxes is open. */
export function mayEdit(
  update: Pick<LifeUpdateRow, 'audience' | 'authorUserId'>,
  viewerId: string,
  contexts: readonly Pick<AccessibleContext, 'boxStatus'>[],
): boolean {
  if (update.authorUserId !== viewerId) return false;
  return (
    update.audience === 'only_me' ||
    contexts.some((context) => context.boxStatus === 'active')
  );
}
