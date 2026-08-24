'use client';

import type {
  LifeUpdate,
  Post,
  ReactionPresets,
  UserId,
} from '@paldora/domain';
import type { Route } from 'next';
import Link from 'next/link';
import { mergeFeedItems } from '../lib/feed-items';
import { LifeUpdateCard } from './life-update-card';
import { PostCard } from './post-feed';

export function UnifiedFeed({
  posts,
  lifeUpdates,
  currentUserId,
  reactionPresets,
  returnPath,
  nextCursor,
  emptyTitle,
  emptyDescription,
}: {
  posts: readonly Post[];
  lifeUpdates: readonly LifeUpdate[];
  currentUserId: UserId;
  reactionPresets: ReactionPresets;
  returnPath: string;
  nextCursor: string | null;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const items = mergeFeedItems(posts, lifeUpdates);
  if (items.length === 0) {
    return (
      <section className="post-feed-empty">
        <div aria-hidden="true">✦</div>
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
      </section>
    );
  }
  return (
    <section className="post-feed" aria-label="Chronological feed">
      {items.map((item) =>
        item.type === 'standard' ? (
          <PostCard
            currentUserId={currentUserId}
            key={`post:${item.post.id}`}
            post={item.post}
            reactionPresets={reactionPresets}
            returnPath={returnPath}
          />
        ) : (
          <LifeUpdateCard
            currentUserId={currentUserId}
            key={`life-update:${item.lifeUpdate.id}`}
            reactionPresets={reactionPresets}
            returnPath={returnPath}
            update={item.lifeUpdate}
          />
        ),
      )}
      {nextCursor && (
        <Link
          className="button-secondary post-load-more"
          href={
            `${returnPath}?cursor=${encodeURIComponent(nextCursor)}` as Route
          }
        >
          Load older posts
        </Link>
      )}
    </section>
  );
}
