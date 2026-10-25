import { FirebaseLifeUpdateCard } from '@/components/life-updates/firebase-life-update-card';
import { FirebaseBoxFeed } from '@/components/posts/firebase-box-feed';
import styles from '@/components/memories/memory-timeline.module.css';
import { EmptyState } from '@/components/ui';
import {
  groupByMonth,
  memoryItemKey,
  monthName,
} from '@/lib/life-updates/memories';
import type {
  FirebaseFeedItem,
  FirebaseLifeUpdateItem,
} from '@/lib/server/firebase/data';
import type { MemoryItemView } from '@paldora/validation';

/** Render live Firebase Memories without the old API-backed interaction actions. */
export function FirebaseMemoryTimeline({
  items,
  presets,
  viewerId,
  boxId,
  empty,
}: {
  items: readonly MemoryItemView[];
  presets: readonly string[];
  viewerId: string;
  boxId?: string | undefined;
  empty: string;
}) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className={styles.timeline}>
      {groupByMonth(items).map((group) => (
        <section
          key={group.key}
          className={styles.group}
          aria-labelledby={`memories-${group.key}`}
        >
          <h2 id={`memories-${group.key}`} className={styles.heading}>
            {monthName(group.month)} {group.year}
          </h2>
          <ul className={styles.items}>
            {group.items.map((item) => {
              if (item.kind === 'post') {
                const post = item.post;
                const feedItem: FirebaseFeedItem = {
                  kind: 'post',
                  id: post.id,
                  boxId: post.box.id,
                  authorName: post.author.displayName,
                  authorAvatarUrl: post.author.avatarUrl,
                  content: post.content,
                  mediaAssetIds: post.media.map((asset) => asset.id),
                  createdAt: post.createdAt,
                  edited: !!post.editedAt,
                  canEdit: post.canEdit,
                  interactions: post.interactions,
                };
                return (
                  <li key={memoryItemKey(item)}>
                    <FirebaseBoxFeed
                      items={[feedItem]}
                      active={post.interactions.canInteract}
                      presets={presets}
                      showBox={!boxId}
                    />
                  </li>
                );
              }
              const update = item.lifeUpdate;
              const card: FirebaseLifeUpdateItem = {
                id: update.id,
                authorName: update.author.displayName,
                authorAvatarUrl: update.author.avatarUrl,
                mediaAssetIds: update.media.map((asset) => asset.id),
                audience: update.audience,
                sections: update.sections.map(({ key, content }) => ({
                  key,
                  content,
                })),
                createdAt: update.createdAt,
                edited: !!update.editedAt,
                canEdit: update.canEdit,
                isOwner: update.author.id === viewerId,
                contexts: update.contexts.map(
                  ({ box, postId, interactions }) => ({
                    boxId: box.id,
                    boxName: box.name,
                    postId,
                    canInteract: interactions.canInteract,
                    interactions,
                  }),
                ),
              };
              return (
                <li key={memoryItemKey(item)}>
                  <FirebaseLifeUpdateCard
                    update={card}
                    selectedBoxId={boxId}
                    presets={presets}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
