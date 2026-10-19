import Link from 'next/link';
import { AppShell } from '../components/app-shell';
import { PageHeader } from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export default async function MemoriesPage() {
  const current = await loadCompletedCurrentUser();
  const years = await (await authenticatedApiClient()).memoryYears();
  return (
    <AppShell active="memories" current={current}>
      <PageHeader
        eyebrow="Your private archive"
        title="Memories"
        description="Browse the stories and photos you can still see, organized by year."
      />
      <section className="memory-years">
        {years.length > 0 ? (
          years.map(({ year, count }) => (
            <Link
              className="memory-year-card"
              href={`/memories/${year}`}
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
            <div>▧</div>
            <h2>No memories yet.</h2>
            <p>Your archive grows naturally as your circles share together.</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
