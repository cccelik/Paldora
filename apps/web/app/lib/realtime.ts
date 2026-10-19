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

/**
 * Targeted invalidation: a page refetches only when the hint concerns what it
 * shows. `resync` is handled by the caller (it means "anything may differ").
 */
export function shouldRefresh(pathname: string, hint: RealtimeHint): boolean {
  const path = pathname.toLowerCase();
  if (hint.type === 'memberships.changed') {
    return path === '/home' || path === '/boxes' || path.startsWith('/boxes/');
  }
  if (isNotificationHint(hint)) return path === '/notifications';
  // Interaction hints never refresh a whole feed: each card refetches only
  // its own summary (R5). Only the post's own page re-renders.
  if (isInteractionHint(hint)) {
    return hint.postId !== undefined && path === `/posts/${hint.postId}`;
  }
  if (!hint.type.startsWith('post.')) return false;
  return (
    path === '/home' ||
    (hint.boxId !== undefined && path === `/boxes/${hint.boxId}`) ||
    (hint.postId !== undefined && path === `/posts/${hint.postId}`)
  );
}

/** Exponential backoff with jitter: about 1 s, 2 s, 4 s … capped at 30 s. */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(30_000, 1_000 * 2 ** attempt);
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}
