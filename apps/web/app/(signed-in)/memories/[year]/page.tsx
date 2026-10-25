import { MemoryScopePage } from '@/components/memories/memory-scope-page';
import { MemoryPeriod } from '@/components/memories/memory-period';
import { BackLink } from '@/components/ui';
import {
  memoriesDescription,
  parseMemoryType,
  parseYear,
} from '@/lib/life-updates/memories';
import { MEMORY_ABSENT } from '@/lib/server/route-params';
import { completedUser, cursorParam, orNotFound } from '@/lib/server/session';
import { notFound } from 'next/navigation';

import { firebaseWebData } from '@/lib/server/firebase/data';
export const metadata = { title: 'Memories' };

/** One UTC year of the viewer's Memories, grouped by month. */
export default async function MemoryYearPage({
  params,
  searchParams,
}: PageProps<'/memories/[year]'>) {
  const me = await completedUser();
  const year = parseYear((await params).year);
  const query = await searchParams;
  const type = parseMemoryType(query.type);
  if (year === null || type === null) notFound();
  const api = await firebaseWebData();
  const [summary, page] = await Promise.all([
    Promise.resolve(undefined),
    orNotFound(
      api.myMemories({
        year,
        type,
        cursor: cursorParam(query.cursor),
        limit: 20,
      }),
      MEMORY_ABSENT,
    ),
  ]);
  return (
    <MemoryScopePage
      title={`Memories of ${year}`}
      description={memoriesDescription}
      back={
        <>
          {' '}
          <BackLink href="/memories">All years</BackLink>{' '}
        </>
      }
    >
      <MemoryPeriod
        scope={{ kind: 'personal' }}
        summary={summary}
        page={page}
        year={year}
        type={type}
        presets={me.preferences.reactionPresets}
        viewerId={me.user.id}
      />
    </MemoryScopePage>
  );
}
