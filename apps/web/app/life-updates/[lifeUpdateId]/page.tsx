import type { LifeUpdateId } from '@paldora/domain';
import { notFound } from 'next/navigation';
import { ApiClientError } from '@paldora/api-client';
import { AppShell } from '../../components/app-shell';
import { LifeUpdateCard } from '../../components/life-update-card';
import { PageHeader } from '../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../lib/api';

export default async function LifeUpdateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ lifeUpdateId: string }>;
  searchParams: Promise<{ post?: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { lifeUpdateId } = await params;
  try {
    const update = await (
      await authenticatedApiClient()
    ).lifeUpdate(lifeUpdateId as LifeUpdateId);
    return (
      <AppShell active="life-updates" current={current}>
        <PageHeader
          eyebrow="Life Update"
          title={update.author.displayName}
          description="A closer look at what has been happening lately."
        />
        <LifeUpdateCard
          currentUserId={current.user.id}
          initialPostId={(await searchParams).post}
          reactionPresets={current.profile.reactionPresets}
          update={update}
        />
      </AppShell>
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
}
