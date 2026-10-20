import {
  boxMemberships,
  hiddenByBlock,
  lifeUpdateDeliveries,
  lifeUpdates,
  posts,
} from '@paldora/database';
import type { MemoryType } from '@paldora/validation';
import { sql, type SQL } from 'drizzle-orm';
import { withinWindow, type MemoryWindow } from './memory-window.js';

/** Whose Memories, which slice of them, and (for a page) which window. */
export interface MemoryScope {
  readonly viewerId: string;
  /** Box Memories: that Box only, and no Only Me. */
  readonly boxId?: string | undefined;
  readonly type: MemoryType;
  /** Absent for the summary, which counts every year. */
  readonly window?: MemoryWindow | undefined;
}

const all = (conditions: readonly (SQL | undefined)[]): SQL =>
  sql.join(
    conditions.filter((condition): condition is SQL => condition !== undefined),
    sql` and `,
  );

/**
 * Posts and Life Updates delivered to the viewer's Boxes, one row per item.
 * It starts from the posts in Boxes the viewer belongs to right now (the
 * `posts_box_feed_index` range per Box), so a former member, a removed
 * member, and a stranger reach nothing. A Life Update is reached through
 * its active backing posts and collapses to one row by `DISTINCT`: every
 * delivery shares the Life Update's `created_at` (pinned by a test), so the
 * row is the same whichever Box it came through. Deleted posts, deleted
 * Life Updates, and anyone in a block relationship with the viewer (either
 * direction) are left out: Memories keep no placeholder (Phase 6
 * decision 15).
 */
function boxContent(scope: MemoryScope): SQL {
  const at = sql`p.created_at`;
  return sql`
    select distinct
      (case when p.kind = 'post' then 'post' else 'life_update' end)::text as item_kind,
      coalesce(d.life_update_id, p.id) as item_id,
      ${at} as at
    from ${posts} p
    join ${boxMemberships} m
      on m.box_id = p.box_id and m.user_id = ${scope.viewerId} and m.status = 'active'
    left join ${lifeUpdateDeliveries} d on d.post_id = p.id
    left join ${lifeUpdates} lu on lu.id = d.life_update_id
    where ${all([
      sql`p.status = 'active'`,
      sql`(p.kind = 'post' or lu.status = 'active')`,
      sql`not ${hiddenByBlock(scope.viewerId, sql.raw('p.author_user_id'))}`,
      scope.boxId === undefined ? undefined : sql`p.box_id = ${scope.boxId}`,
      scope.type === 'posts' ? sql`p.kind = 'post'` : undefined,
      scope.type === 'life_updates' ? sql`p.kind = 'life_update'` : undefined,
      scope.window ? withinWindow(at, scope.window) : undefined,
    ])}`;
}

/** The viewer's own Only Me Life Updates: theirs alone, never in a Box. */
function onlyMe(scope: MemoryScope): SQL {
  const at = sql`lu.created_at`;
  return sql`
    select 'life_update'::text as item_kind, lu.id as item_id, ${at} as at
    from ${lifeUpdates} lu
    where ${all([
      sql`lu.author_user_id = ${scope.viewerId}`,
      sql`lu.audience = 'only_me'`,
      sql`lu.status = 'active'`,
      scope.window ? withinWindow(at, scope.window) : undefined,
    ])}`;
}

/**
 * Every Memory the viewer can access in the scope, as `(item_kind,
 * item_id, at)` rows: the one candidate definition shared by the page and
 * the summary, so the counts always match the items. Nothing is stored;
 * authorization is decided here, on every query.
 */
export function memoryCandidates(scope: MemoryScope): SQL {
  const withOnlyMe = scope.boxId === undefined && scope.type !== 'posts';
  return withOnlyMe
    ? sql`${boxContent(scope)} union all ${onlyMe(scope)}`
    : boxContent(scope);
}
