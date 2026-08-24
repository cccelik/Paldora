import type { BoxId } from '@paldora/domain';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../../../components/app-shell';
import { MemoryTimeline } from '../../../../../components/memory-timeline';
import { PageHeader } from '../../../../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../../../../lib/api';

export default async function BoxMemoryMonthPage({
  params,
}: {
  params: Promise<{ boxId: string; year: string; month: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const values = await params;
  const boxId = values.boxId as BoxId;
  const year = Number(values.year);
  const month = Number(values.month);
  if (!Number.isInteger(year) || month < 1 || month > 12) notFound();
  const api = await authenticatedApiClient();
  const [box, page] = await Promise.all([
    api.box(boxId),
    api.memories({ year, month, limit: 20 }, boxId),
  ]);
  const title = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return (
    <AppShell active="boxes" current={current}>
      <PageHeader
        description="Membership and visibility are rechecked every time this archive opens."
        eyebrow={`${box.name} · Box archive`}
        title={title}
      />
      <MemoryTimeline
        currentUserId={current.user.id}
        items={page.items}
        reactionPresets={current.profile.reactionPresets}
        returnPath={`/boxes/${boxId}/memories/${year}/${month}`}
      />
    </AppShell>
  );
}
