import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { MemoryTimeline } from '../../../components/memory-timeline';
import { PageHeader } from '../../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../../lib/api';

export default async function MemoryMonthPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const values = await params;
  const year = Number(values.year);
  const month = Number(values.month);
  if (!Number.isInteger(year) || month < 1 || month > 12) notFound();
  const page = await (
    await authenticatedApiClient()
  ).memories({ year, month, limit: 20 });
  const title = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return (
    <AppShell active="memories" current={current}>
      <PageHeader
        eyebrow="Your memory archive"
        title={title}
        description="Only content you can currently access appears here."
      />
      <MemoryTimeline
        currentUserId={current.user.id}
        items={page.items}
        reactionPresets={current.profile.reactionPresets}
        returnPath={`/memories/${year}/${month}`}
      />
    </AppShell>
  );
}
