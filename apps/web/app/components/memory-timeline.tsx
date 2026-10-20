import {
  MEMORY_TYPES,
  type MemoryItemView,
  type MemorySummaryView,
  type MemoryType,
} from '@paldora/validation';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  countLabel,
  groupByMonth,
  memoryHref,
  memoryItemKey,
  memoryTypeLabels,
  monthName,
  type MemoryScope,
} from '../lib/memories';
import { LifeUpdateCard } from './life-update-card';
import { MoreLink } from './more-link';
import { PostCard } from './post-card';
import { EmptyState } from './ui';
import styles from './memory-timeline.module.css';

const allMonths = Array.from({ length: 12 }, (_, index) => index + 1);

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      className={styles.choice}
      href={href as Route}
      aria-current={current ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

/** Every year with content, newest first, with how much each holds. */
export function MemoryYearNav({
  scope,
  years,
  current,
}: {
  scope: MemoryScope;
  years: MemorySummaryView['years'];
  current?: number | undefined;
}) {
  return (
    <nav aria-label="Years" className={styles.nav}>
      <ul className={styles.choices}>
        {years.map(({ year, count }) => (
          <li key={year}>
            <NavLink
              href={memoryHref(scope, { year })}
              current={year === current}
            >
              <span className={styles.label}>{year}</span>{' '}
              <span className={styles.count}>{countLabel(count)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The twelve UTC months of one year; empty months are named, not linked. */
export function MemoryMonthNav({
  scope,
  year,
  months,
  current,
}: {
  scope: MemoryScope;
  year: number;
  months: MemorySummaryView['months'];
  current?: number | undefined;
}) {
  const counts = new Map(months.map(({ month, count }) => [month, count]));
  return (
    <nav aria-label={`Months of ${year}`} className={styles.nav}>
      <ul className={`${styles.choices} ${styles.months}`}>
        {allMonths.map((month) => {
          const count = counts.get(month);
          return (
            <li key={month}>
              {count ? (
                <NavLink
                  href={memoryHref(scope, { year, month })}
                  current={month === current}
                >
                  <span className={styles.label}>{monthName(month)}</span>{' '}
                  <span className={styles.count}>{countLabel(count)}</span>
                </NavLink>
              ) : (
                <span className={`${styles.choice} ${styles.quiet}`}>
                  <span className={styles.label}>{monthName(month)}</span>{' '}
                  <span className={styles.count}>Nothing</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Everything, or only posts, or only Life Updates, for the same period. */
export function MemoryTypeFilter({
  scope,
  year,
  month,
  type,
}: {
  scope: MemoryScope;
  year: number;
  month?: number | undefined;
  type: MemoryType;
}) {
  return (
    <nav aria-label="Show" className={styles.nav}>
      <ul className={styles.filters}>
        {MEMORY_TYPES.map((option) => (
          <li key={option}>
            <NavLink
              href={memoryHref(scope, { year, month, type: option })}
              current={option === type}
            >
              {memoryTypeLabels[option]}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MemoryCard({
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
