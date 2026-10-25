import { MoreLink } from '@/components/common/more-link';
import {
  FirebaseMemoryMonthNav,
  FirebaseMemoryYearNav,
  MemoryTypeFilter,
} from '@/components/memories/memory-navigation';

import { FirebaseMemoryTimeline } from '@/components/memories/firebase-memory-timeline';

import {
  memoryHref,
  monthName,
  type MemoryScope,
} from '@/lib/life-updates/memories';
import {
  type MemoryItemView,
  type MemorySummaryView,
  type MemoryType,
} from '@paldora/validation';
/**
 * One year or one month of Memories: where you are, the way to other
 * periods and filters, the items, and "Load older" as a plain link.
 */
export function MemoryPeriod({
  scope,
  page,
  year,
  month,
  type,
  presets,
  viewerId,
}: {
  scope: MemoryScope;
  summary?: MemorySummaryView | undefined;
  page: { items: readonly MemoryItemView[]; nextCursor: string | null };
  year: number;
  month?: number | undefined;
  type: MemoryType;
  presets: readonly string[];
  viewerId: string;
}) {
  const period = month ? `${monthName(month)} ${year}` : String(year);
  const what = {
    all: 'Nothing',
    posts: 'No posts',
    life_updates: 'No Life Updates',
  }[type];
  const empty = page.nextCursor
    ? 'No visible memories in this batch. Load older memories to keep looking.'
    : `${what} from ${period} that you can still see.`;
  return (
    <>
      {
        <>
          <FirebaseMemoryYearNav scope={scope} current={year} />
          <FirebaseMemoryMonthNav scope={scope} year={year} current={month} />
        </>
      }
      <MemoryTypeFilter scope={scope} year={year} month={month} type={type} />
      {
        <FirebaseMemoryTimeline
          items={page.items}
          presets={presets}
          viewerId={viewerId}
          boxId={scope.kind === 'box' ? scope.boxId : undefined}
          empty={empty}
        />
      }
      {page.nextCursor ? (
        <MoreLink
          href={memoryHref(scope, {
            year,
            month,
            type,
            cursor: page.nextCursor,
          })}
          label="Load older memories"
        />
      ) : null}
    </>
  );
}
