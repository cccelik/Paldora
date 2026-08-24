import type { FeedItem, LifeUpdate, Post } from '@paldora/domain';

export function mergeFeedItems(
  posts: readonly Post[],
  lifeUpdates: readonly LifeUpdate[],
): FeedItem[] {
  return [
    ...posts.map((post): FeedItem => ({
      type: 'standard',
      occurredAt: post.createdAt,
      post,
    })),
    ...lifeUpdates.map((lifeUpdate): FeedItem => ({
      type: 'life_update',
      occurredAt: lifeUpdate.createdAt,
      lifeUpdate,
    })),
  ].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime() ||
      itemId(right).localeCompare(itemId(left)),
  );
}

function itemId(item: FeedItem): string {
  return item.type === 'standard' ? item.post.id : item.lifeUpdate.id;
}
