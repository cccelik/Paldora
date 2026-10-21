import { MemoryScopePage } from '@/components/memories/memory-scope-page';
import { MemoryPeriod } from '@/components/memories/memory-timeline';
import { BackLink, EmptyState } from '@/components/ui';
import {
  memoryHref,
  monthName,
  parsePeriod,
} from '@/lib/life-updates/memories';
import { roomHref, roomUsernameParam } from '@/lib/rooms/room-theme';
import { ROOM_ABSENT } from '@/lib/server/route-params';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '@/lib/server/session';
import { type Route } from 'next';
import { notFound } from 'next/navigation';
export const metadata = { title: 'Room Memories' };

const absent = ROOM_ABSENT;

/** `?year=&month=&type=`; anything present but malformed is not a page. */

/**
 * What a Room's owner shared that the viewer can still see, by UTC month.
 * Access is the Room's: anyone who may not visit it gets the same
 * not-found page, and every item is re-authorized for this viewer.
 */
export default async function RoomMemoriesPage({
  params,
  searchParams,
}: PageProps<'/rooms/[username]/memories'>) {
  const me = await completedUser();
  const username = roomUsernameParam((await params).username);
  if (username === null) notFound();
  const query = await searchParams;
  const period = parsePeriod(query);
  if (period === null) notFound();
  const api = await apiClient();
  const [room, summary] = await Promise.all([
    orNotFound(api.room(username), absent),
    orNotFound(api.roomContentSummary(username, period.year), absent),
  ]);
  const year = period.year ?? summary.year;
  const page =
    year === null
      ? null
      : await orNotFound(
          api.roomContent(username, {
            year,
            month: period.month,
            type: period.type,
            cursor: cursorParam(query.cursor),
            limit: 20,
          }),
          absent,
        );
  const name = room.owner.displayName;
  const scope = { kind: 'room', username: room.owner.username } as const;
  const where = period.month ? `${monthName(period.month)} ${year}` : year;
  return (
    <MemoryScopePage
      title={where ? `${name}’s Memories: ${where}` : `${name}’s Memories`}
      description={`What ${name} shared in Boxes you are in, by the month it was shared. Months follow UTC, so something shared near midnight can sit in the neighbouring month on your clock.`}
      back={
        <>
          {' '}
          <BackLink href={roomHref(room.owner.username) as Route}>
            {name}’s Room
          </BackLink>{' '}
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
        <EmptyState>Nothing here to show yet.</EmptyState>
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
