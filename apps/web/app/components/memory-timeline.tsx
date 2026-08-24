import type { MemoryItem, ReactionPresets, UserId } from '@paldora/domain';
import { LifeUpdateCard } from './life-update-card';
import { PostFeed } from './post-feed';

export function MemoryTimeline({
  items,
  currentUserId,
  reactionPresets,
  returnPath,
}: {
  items: MemoryItem[];
  currentUserId: UserId;
  reactionPresets: ReactionPresets;
  returnPath: string;
}) {
  if (items.length === 0)
    return (
      <section className="post-feed-empty">
        <div>▧</div>
        <h2>No memories here yet.</h2>
        <p>
          Posts, photos, and Life Updates from this period will appear here.
        </p>
      </section>
    );
  return (
    <section className="memory-timeline" aria-label="Memory timeline">
      {items.map((item) => (
        <div
          className="memory-entry"
          key={`${item.type}-${item.type === 'post' ? item.post.id : item.lifeUpdate.id}`}
        >
          <time dateTime={item.occurredAt}>
            {new Intl.DateTimeFormat('en', {
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(item.occurredAt))}
          </time>
          {item.type === 'post' ? (
            <PostFeed
              currentUserId={currentUserId}
              nextCursor={null}
              posts={[item.post]}
              reactionPresets={reactionPresets}
              returnPath={returnPath}
            />
          ) : (
            <LifeUpdateCard
              currentUserId={currentUserId}
              reactionPresets={reactionPresets}
              returnPath={returnPath}
              update={item.lifeUpdate}
            />
          )}
        </div>
      ))}
    </section>
  );
}
