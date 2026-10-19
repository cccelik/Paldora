/** What a realtime message tells the page: IDs only, never content. */
export interface RealtimeHint {
  readonly type: string;
  readonly boxId?: string;
  readonly postId?: string;
}

export function parseHint(data: string): RealtimeHint | null {
  try {
    const value = JSON.parse(data) as Record<string, unknown>;
    if (typeof value.type !== 'string') return null;
    return {
      type: value.type,
      ...(typeof value.boxId === 'string'
        ? { boxId: value.boxId.toLowerCase() }
        : {}),
      ...(typeof value.postId === 'string'
        ? { postId: value.postId.toLowerCase() }
        : {}),
    };
  } catch {
    return null;
  }
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
