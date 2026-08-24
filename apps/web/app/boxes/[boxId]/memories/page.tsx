import type { BoxId } from '@paldora/domain';
import Link from 'next/link';
import { AppShell } from '../../../components/app-shell';
import { PageHeader } from '../../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../../lib/api';

export default async function BoxMemoriesPage({
  params,
}: {
  params: Promise<{ boxId: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const boxId = (await params).boxId as BoxId;
  const api = await authenticatedApiClient();
  const [box, years] = await Promise.all([
    api.box(boxId),
    api.memoryYears(boxId),
  ]);
  return (
    <AppShell active="boxes" current={current}>
      <PageHeader
        description="Only content still visible to active members appears here."
        eyebrow="Box archive"
        title={`${box.name} memories`}
      />
      <section className="memory-years">
        {years.length > 0 ? (
          years.map(({ year, count }) => (
            <Link
              className="memory-year-card"
              href={`/boxes/${boxId}/memories/${year}`}
              key={year}
            >
              <strong>{year}</strong>
              <span>
                {count} {count === 1 ? 'memory' : 'memories'}
              </span>
            </Link>
          ))
        ) : (
          <div className="post-feed-empty">
            <div aria-hidden="true">▧</div>
            <h2>No Box memories yet.</h2>
            <p>This archive grows as members share posts and Life Updates.</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
