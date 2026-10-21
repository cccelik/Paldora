/** A friendship is accepted or on its way there; blocks live in `user_blocks`. */
export const FRIENDSHIP_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

/** How a friendship looks from the viewer's side. */
export const FRIENDSHIP_DIRECTIONS = [
  'incoming',
  'outgoing',
  'established',
] as const;
export type FriendshipDirection = (typeof FRIENDSHIP_DIRECTIONS)[number];
