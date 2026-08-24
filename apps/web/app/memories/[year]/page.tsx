import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { PageHeader } from '../../components/ui';
import { loadCompletedCurrentUser } from '../../lib/api';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export default async function MemoryYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const year = Number((await params).year);
  return (
    <AppShell active="memories" current={current}>
      <PageHeader
        eyebrow="Memory timeline"
        title={String(year)}
        description="Choose a month to revisit."
      />
      <section className="memory-months">
        {months.map((month, index) => (
          <Link
            className="memory-month-card"
            href={`/memories/${year}/${index + 1}`}
            key={month}
          >
            <strong>{month}</strong>
            <span>Open timeline</span>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
