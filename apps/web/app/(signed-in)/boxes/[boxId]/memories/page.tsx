import { uuidSchema } from '@paldora/validation';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MemoryPeriod } from '../../../../components/memory-timeline';
import { EmptyState, PageHeader } from '../../../../components/ui';
import {
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

export const metadata = { title: 'Box Memories' };

const absent = ['BOX_NOT_FOUND', 'VALIDATION_FAILED'];

type Query = Awaited<PageProps<'/boxes/[boxId]/memories'>['searchParams']>;

/** `?year=&month=&type=`; anything present but malformed is not a page. */
function parsePeriod(query: Query) {
  const year = query.year === undefined ? undefined : parseYear(query.year);
  const month = query.month === undefined ? undefined : parseMonth(query.month);
  const type = parseMemoryType(query.type);
  if (year === null || month === null || type === null) notFound();
  if (month !== undefined && year === undefined) notFound();
  return { year, month, type };
}

/**
 * One Box's Memories. Only current members get past the API; a former
 * member, a stranger, and a guessed ID all see the same not-found page.
 */
export default async function BoxMemoriesPage({
  params,
  searchParams,
}: PageProps<'/boxes/[boxId]/memories'>) {
  const me = await completedUser();
  const parsedId = uuidSchema.safeParse((await params).boxId);
  if (!parsedId.success) notFound();
  const boxId = parsedId.data;
  const query = await searchParams;
  const period = parsePeriod(query);
  const api = await apiClient();
  const [box, summary] = await Promise.all([
    orNotFound(api.box(boxId), absent),
    orNotFound(api.boxMemorySummary(boxId, period.year), absent),
  ]);
  const year = period.year ?? summary.year;
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
    <div className={styles.stack}>
      <p>
        <Link href={`/boxes/${boxId}`}>← {box.name}</Link>
      </p>
      <PageHeader
        title={
          where ? `${box.name} Memories: ${where}` : `${box.name} Memories`
        }
        description={`Everything shared in ${box.name} that you can still see, by the month it was shared. Months follow UTC, so something shared near midnight can sit in the neighbouring month on your clock.`}
      />
      {period.month ? (
        <p>
          <Link href={memoryHref(scope, { year: year ?? undefined }) as Route}>
            ← All of {year}
          </Link>
        </p>
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
    </div>
  );
}
