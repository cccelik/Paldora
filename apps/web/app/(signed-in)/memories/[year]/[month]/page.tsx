import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MemoryPeriod } from '../../../../components/memory-timeline';
import { PageHeader } from '../../../../components/ui';
import {
  memoriesDescription,
  memoryHref,
  monthName,
  parseMemoryType,
  parseMonth,
  parseYear,
} from '../../../../lib/memories';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '../../../../lib/session';
import styles from '../../../page-stack.module.css';

export const metadata = { title: 'Memories' };

/** One UTC month of the viewer's Memories. */
export default async function MemoryMonthPage({
  params,
  searchParams,
}: PageProps<'/memories/[year]/[month]'>) {
  const me = await completedUser();
  const segments = await params;
  const year = parseYear(segments.year);
  const month = parseMonth(segments.month);
  const query = await searchParams;
  const type = parseMemoryType(query.type);
  if (year === null || month === null || type === null) notFound();
  const api = await apiClient();
  const [summary, page] = await Promise.all([
    api.myMemorySummary(year),
    orNotFound(
      api.myMemories({
        year,
        month,
        type,
        cursor: cursorParam(query.cursor),
        limit: 20,
      }),
      ['VALIDATION_FAILED'],
    ),
  ]);
  const scope = { kind: 'personal' } as const;
  return (
    <div className={styles.stack}>
      <p>
        <Link href={memoryHref(scope, { year }) as Route}>← All of {year}</Link>
      </p>
      <PageHeader
        title={`${monthName(month)} ${year}`}
        description={memoriesDescription}
      />
      <MemoryPeriod
        scope={scope}
        summary={summary}
        page={page}
        year={year}
        month={month}
        type={type}
        presets={me.preferences.reactionPresets}
        viewerId={me.user.id}
      />
    </div>
  );
}
