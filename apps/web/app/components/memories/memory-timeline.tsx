import { LifeUpdateCard } from '@/components/life-updates/life-update-card';
import styles from '@/components/memories/memory-timeline.module.css';
import { PostCard } from '@/components/posts/post-card';
import { EmptyState } from '@/components/ui';
import {
  groupByMonth,
  memoryItemKey,
  monthName,
} from '@/lib/life-updates/memories';
import { type MemoryItemView } from '@paldora/validation';
export function MemoryCard({
  item,
  presets,
  viewerId,
  boxId,
}: {
  item: MemoryItemView;
  presets: readonly string[];
  viewerId: string;
  boxId?: string | undefined;
}) {
  if (item.kind === 'post') {
    return <PostCard post={item.post} presets={presets} showBox={!boxId} />;
  }
  return (
    <LifeUpdateCard
      lifeUpdate={item.lifeUpdate}
      presets={presets}
      viewerId={viewerId}
      showBox={!boxId}
      selectedBoxId={boxId}
    />
  );
}

/**
 * Memories, newest first, under a heading per UTC month. Each card is the
 * live post or Life Update; in a Box's Memories a Life Update shows only
 * that Box's conversation.
 */
export function MemoryTimeline({
  items,
  presets,
  viewerId,
  boxId,
  empty,
}: {
  items: readonly MemoryItemView[];
  presets: readonly string[];
  viewerId: string;
  /** Box Memories: cards stay in this Box. */
  boxId?: string | undefined;
  empty: string;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
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
            {group.items.map((item) => (
              <li key={memoryItemKey(item)}>
                <MemoryCard
                  item={item}
                  presets={presets}
                  viewerId={viewerId}
                  boxId={boxId}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export {
  MemoryMonthNav,
  MemoryTypeFilter,
  MemoryYearNav,
} from '@/components/memories/memory-navigation';
export { MemoryPeriod } from '@/components/memories/memory-period';
