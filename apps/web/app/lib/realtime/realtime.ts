/** What a realtime message tells the page: IDs only, never content. */
export interface RealtimeHint {
  readonly type: string;
  readonly boxId?: string;
  readonly postId?: string;
  readonly commentId?: string;
  readonly notificationId?: string;
}

/** The window event the bridge dispatches for each hint (a `RealtimeHint`). */
export const REALTIME_EVENT = 'paldora:realtime';

/**
 * How long a burst of hints is coalesced before the page reacts. One set of
 * values, named by what each reaction costs.
 */
export const REALTIME_DEBOUNCE_MS = {
  /** A full `router.refresh()` of the route. */
  routeRefresh: 400,
  /** The header's unread-count refetch. */
  unreadCount: 300,
  /** One post's interaction summary refetch. */
  postInteractions: 500,
} as const;

const idFields = ['boxId', 'postId', 'commentId', 'notificationId'] as const;

export function parseHint(data: string): RealtimeHint | null {
  try {
    const value = JSON.parse(data) as Record<string, unknown> | null;
    if (!value || typeof value.type !== 'string') return null;
    const hint: { -readonly [Key in keyof RealtimeHint]: RealtimeHint[Key] } = {
      type: value.type,
    };
    for (const field of idFields) {
      const id = value[field];
      if (typeof id === 'string') hint[field] = id.toLowerCase();
    }
    return hint;
  } catch {
    return null;
  }
}

const interactionTypes = new Set([
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'reaction.changed',
]);

const notificationTypes = new Set([
  'notification.created',
  'notifications.changed',
]);

/** Comments and reactions on one post: cards refetch their own summary. */
export function isInteractionHint(hint: RealtimeHint): boolean {
  return interactionTypes.has(hint.type);
}

/** The viewer's notifications changed: the bell refetches its count. */
export function isNotificationHint(hint: RealtimeHint): boolean {
  return notificationTypes.has(hint.type);
}

/** Personal Memories, which can hold content from any of the viewer's Boxes. */
function isPersonalMemories(path: string): boolean {
  return path === '/memories' || path.startsWith('/memories/');
}

/**
 * A Room and its Memories: access depends on shared Boxes, and previews can
 * hold the owner's content from any Box the viewer is in. Its pages show no
 * interaction controls that need a page refresh. The customizer is left out
 * on purpose: a refresh there would replace the saved Room under drafts the
 * owner has not saved yet, and its own saves already return the new Room.
 */
function isRoom(path: string): boolean {
  return path.startsWith('/rooms/') && !isRoomCustomizer(path);
}

/**
 * After a reconnect (`resync`) a page may have missed hints, so it
 * refreshes, except the customizer, which never refreshes under drafts.
 */
export function shouldResync(pathname: string): boolean {
  return !isRoomCustomizer(pathname.toLowerCase());
}

/** `/rooms/{username}/customize` (and anything below it). */
export function isRoomCustomizer(path: string): boolean {
  const [, rooms, username, page] = path.split('/');
  return rooms === 'rooms' && Boolean(username) && page === 'customize';
}

/**
 * Targeted invalidation: a page refetches only when the hint concerns what it
 * shows. `resync` is handled by the caller (it means "anything may differ").
 */
export function shouldRefresh(pathname: string, hint: RealtimeHint): boolean {
  const path = pathname.toLowerCase();
  if (hint.type === 'memberships.changed') {
    return (
      path === '/home' ||
      path === '/boxes' ||
      path.startsWith('/boxes/') ||
      path === '/life-updates' ||
      path.startsWith('/life-updates/') ||
      isPersonalMemories(path) ||
      isRoom(path)
    );
  }
  if (isNotificationHint(hint)) return path === '/notifications';
  // Interaction hints never refresh a whole feed: each card refetches only
  // its own summary (R5). Only the post's own page re-renders.
  if (isInteractionHint(hint)) {
    return hint.postId !== undefined && path === `/posts/${hint.postId}`;
  }
  return hint.type.startsWith('post.') && showsPost(path, hint);
}

/** Pages that list or show the post a `post.*` hint names. */
function showsPost(path: string, hint: RealtimeHint): boolean {
  const box = hint.boxId === undefined ? null : `/boxes/${hint.boxId}`;
  return (
    path === '/home' ||
    path === '/life-updates' ||
    isPersonalMemories(path) ||
    isRoom(path) ||
    (box !== null && (path === box || path === `${box}/memories`)) ||
    (hint.postId !== undefined && path === `/posts/${hint.postId}`)
  );
}

/**
 * For a page that shows posts its URL does not name (a Life Update's page
 * shows its backing posts): refresh when a post or its conversation changes.
 */
export function concernsPosts(
  postIds: ReadonlySet<string>,
  hint: RealtimeHint,
): boolean {
  if (hint.postId === undefined || !postIds.has(hint.postId)) return false;
  return hint.type.startsWith('post.') || isInteractionHint(hint);
}

/** Exponential backoff with jitter: about 1 s, 2 s, 4 s … capped at 30 s. */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(30_000, 1_000 * 2 ** attempt);
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}
