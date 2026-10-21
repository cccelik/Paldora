import { MemoryScopePage } from '@/components/memories/memory-scope-page';
import { MemoryPeriod } from '@/components/memories/memory-timeline';
import { BackLink } from '@/components/ui';
import {
  memoriesDescription,
  memoryHref,
  monthName,
  parseMemoryType,
  parseMonth,
  parseYear,
} from '@/lib/life-updates/memories';
import { MEMORY_ABSENT } from '@/lib/server/route-params';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '@/lib/server/session';
import { type Route } from 'next';
import { notFound } from 'next/navigation';
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
      MEMORY_ABSENT,
    ),
  ]);
  const scope = { kind: 'personal' } as const;
  return (
    <MemoryScopePage
      title={`${monthName(month)} ${year}`}
      description={memoriesDescription}
      back={
        <>
          {' '}
          <BackLink href={memoryHref(scope, { year }) as Route}>
            All of {year}
          </BackLink>{' '}
        </>
      }
    >
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
    </MemoryScopePage>
  );
}
