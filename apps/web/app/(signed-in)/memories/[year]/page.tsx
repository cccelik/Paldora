import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MemoryPeriod } from '../../../components/memory-timeline';
import { PageHeader } from '../../../components/ui';
import {
  memoriesDescription,
  parseMemoryType,
  parseYear,
} from '../../../lib/memories';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '../../../lib/session';
import styles from '../../page-stack.module.css';

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
  const api = await apiClient();
  const [summary, page] = await Promise.all([
    api.myMemorySummary(year),
    orNotFound(
      api.myMemories({
        year,
        type,
        cursor: cursorParam(query.cursor),
        limit: 20,
      }),
      ['VALIDATION_FAILED'],
    ),
  ]);
  return (
    <div className={styles.stack}>
      <p>
        <Link href="/memories">← All years</Link>
      </p>
      <PageHeader
        title={`Memories of ${year}`}
        description={memoriesDescription}
      />
      <MemoryPeriod
        scope={{ kind: 'personal' }}
        summary={summary}
        page={page}
        year={year}
        type={type}
        presets={me.preferences.reactionPresets}
        viewerId={me.user.id}
      />
    </div>
  );
}
