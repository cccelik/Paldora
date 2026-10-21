import styles from '@/components/memories/memory-navigation.module.css';
import {
  countLabel,
  memoryHref,
  memoryTypeLabels,
  monthName,
  type MemoryScope,
} from '@/lib/life-updates/memories';
import {
  MEMORY_TYPES,
  type MemorySummaryView,
  type MemoryType,
} from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
import { type ReactNode } from 'react';
export function NavLink({
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

const allMonths = Array.from({ length: 12 }, (_, index) => index + 1);
