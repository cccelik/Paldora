import { MoreLink } from '@/components/common/more-link';
import {
  MemoryMonthNav,
  MemoryTypeFilter,
  MemoryYearNav,
} from '@/components/memories/memory-navigation';
import { MemoryTimeline } from '@/components/memories/memory-timeline';
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
  summary,
  page,
  year,
  month,
  type,
  presets,
  viewerId,
}: {
  scope: MemoryScope;
  summary: MemorySummaryView;
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
  return (
    <>
      {summary.years.length > 0 ? (
        <MemoryYearNav scope={scope} years={summary.years} current={year} />
      ) : null}
      <MemoryMonthNav
        scope={scope}
        year={year}
        months={summary.months}
        current={month}
      />
      <MemoryTypeFilter scope={scope} year={year} month={month} type={type} />
      <MemoryTimeline
        items={page.items}
        presets={presets}
        viewerId={viewerId}
        boxId={scope.kind === 'box' ? scope.boxId : undefined}
        empty={`${what} from ${period} that you can still see.`}
      />
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
