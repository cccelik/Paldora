import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { hiddenByBlock } from './blocks.js';
import { boxMemberships, boxes, friendships, type RoomRow } from './schema.js';

/**
 * The relationship facts a Room's audience is decided from (ADR 017). The
 * Room access query selects all of them for every request, so every denial
 * does the same work. The block fragment is the shared `hiddenByBlock`;
 * this file adds no block logic of its own.
 *
 * - `isFriend`: an accepted friendship between viewer and owner.
 * - `sharesBox`: both hold an active membership in the same Box. A deleted
 *   Box has no rows (memberships cascade); an archived one still counts,
 *   because its members can still read it (plan B3). To count only active
 *   Boxes, add `and shared_box.status = 'active'`.
 * - `blocked`: a block in either direction.
 */
export function roomAccessConditions(
  viewerId: string,
  owner: AnyColumn | SQL,
): { isFriend: SQL; sharesBox: SQL; blocked: SQL } {
  return {
    isFriend: sql`exists (
      select 1 from ${friendships}
      where ${friendships.userLowId} = least(${viewerId}::uuid, ${owner})
        and ${friendships.userHighId} = greatest(${viewerId}::uuid, ${owner})
        and ${friendships.status} = 'accepted'
    )`,
    sharesBox: sql`exists (
      select 1
      from ${boxMemberships} viewer_membership
      join ${boxMemberships} owner_membership
        on owner_membership.box_id = viewer_membership.box_id
       and owner_membership.user_id = ${owner}
       and owner_membership.status = 'active'
      join ${boxes} shared_box on shared_box.id = viewer_membership.box_id
      where viewer_membership.user_id = ${viewerId}::uuid
        and viewer_membership.status = 'active'
    )`,
    blocked: hiddenByBlock(viewerId, owner),
  };
}

/** The settings columns a Room is served from (no keys, no timestamps). */
export type RoomSettingsRow = Pick<
  RoomRow,
  | 'visibility'
  | 'themePreset'
  | 'layout'
  | 'accent'
  | 'font'
  | 'decorationPack'
  | 'sparkles'
  | 'location'
  | 'currently'
  | 'musicUrl'
  | 'musicTitle'
  | 'musicArtist'
  | 'bannerMediaId'
  | 'topFriendsSize'
  | 'topFriendsVisibility'
>;

/**
 * The column defaults of migration 0007: what a person without a Room row
 * is served. A unit test asserts these equal `DEFAULT_ROOM` in the domain.
 */
export const ROOM_DEFAULTS: Readonly<RoomSettingsRow> = {
  visibility: 'friends',
  themePreset: 'cream_paper',
  layout: 'two_column',
  accent: null,
  font: null,
  decorationPack: null,
  sparkles: false,
  location: null,
  currently: null,
  musicUrl: null,
  musicTitle: null,
  musicArtist: null,
  bannerMediaId: null,
  topFriendsSize: 8,
  topFriendsVisibility: 'friends',
};
