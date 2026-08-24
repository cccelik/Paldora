import type { BoxId } from '@paldora/domain';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../../components/app-shell';
import { PageHeader } from '../../../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../../../lib/api';

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

export default async function BoxMemoryYearPage({
  params,
}: {
  params: Promise<{ boxId: string; year: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const values = await params;
  const boxId = values.boxId as BoxId;
  const year = Number(values.year);
  if (!Number.isInteger(year)) notFound();
  const box = await (await authenticatedApiClient()).box(boxId);
  return (
    <AppShell active="boxes" current={current}>
      <PageHeader
        description="Choose a month to revisit together."
        eyebrow={`${box.name} · Box archive`}
        title={String(year)}
      />
      <section className="memory-months">
        {months.map((month, index) => (
          <Link
            className="memory-month-card"
            href={`/boxes/${boxId}/memories/${year}/${index + 1}`}
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
