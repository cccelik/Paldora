import { MemoryScopePage } from '@/components/memories/memory-scope-page';
import { MemoryPeriod } from '@/components/memories/memory-period';
import { BackLink, EmptyState } from '@/components/ui';
import {
  memoryHref,
  monthName,
  parsePeriod,
} from '@/lib/life-updates/memories';
import { BOX_ABSENT, uuidParam } from '@/lib/server/route-params';
import { completedUser, cursorParam, orNotFound } from '@/lib/server/session';
import { type Route } from 'next';
import { notFound } from 'next/navigation';

import { firebaseWebData } from '@/lib/server/firebase/data';
export const metadata = { title: 'Box Memories' };

const absent = BOX_ABSENT;

/** `?year=&month=&type=`; anything present but malformed is not a page. */

/**
 * One Box's Memories. Only current members get past the API; a former
 * member, a stranger, and a guessed ID all see the same not-found page.
 */
export default async function BoxMemoriesPage({
  params,
  searchParams,
}: PageProps<'/boxes/[boxId]/memories'>) {
  const me = await completedUser();
  const parsedId = uuidParam((await params).boxId);
  const boxId = parsedId;
  const query = await searchParams;
  const period = parsePeriod(query);
  if (period === null) notFound();
  const api = await firebaseWebData();
  const [box, summary] = await Promise.all([
    orNotFound(api.box(boxId), absent),
    Promise.resolve(undefined),
  ]);
  const year = period.year ?? new Date().getUTCFullYear();
  const page =
    year === null
      ? null
      : await orNotFound(
          api.boxMemories(boxId, {
            year,
            month: period.month,
            type: period.type,
            cursor: cursorParam(query.cursor),
            limit: 20,
          }),
          absent,
        );
  const scope = { kind: 'box', boxId } as const;
  const where = period.month ? `${monthName(period.month)} ${year}` : year;
  return (
    <MemoryScopePage
      title={where ? `${box.name} Memories: ${where}` : `${box.name} Memories`}
      description={`Everything shared in ${box.name} that you can still see, by the month it was shared. Months follow UTC, so something shared near midnight can sit in the neighbouring month on your clock.`}
      back={
        <>
          {' '}
          <BackLink href={`/boxes/${boxId}`}>{box.name}</BackLink>{' '}
        </>
      }
    >
      {period.month ? (
        <BackLink
          href={memoryHref(scope, { year: year ?? undefined }) as Route}
        >
          All of {year}
        </BackLink>
      ) : null}
      {year === null || page === null ? (
        <EmptyState>
          Nothing in {box.name} yet. Posts and Life Updates shared here collect
          in its Memories as time goes by.
        </EmptyState>
      ) : (
        <MemoryPeriod
          scope={scope}
          summary={summary}
          page={page}
          year={year}
          month={period.month}
          type={period.type}
          presets={me.preferences.reactionPresets}
          viewerId={me.user.id}
        />
      )}
    </MemoryScopePage>
  );
}
