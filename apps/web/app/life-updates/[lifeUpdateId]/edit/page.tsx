import { ApiClientError } from '@paldora/api-client';
import type { LifeUpdateId } from '@paldora/domain';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { LifeUpdateEditor } from '../../../components/life-update-editor';
import { PageHeader } from '../../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../../lib/api';

export default async function EditLifeUpdatePage({
  params,
}: {
  params: Promise<{ lifeUpdateId: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { lifeUpdateId } = await params;
  try {
    const update = await (
      await authenticatedApiClient()
    ).lifeUpdate(lifeUpdateId as LifeUpdateId);
    if (update.author.userId !== current.user.id) notFound();
    return (
      <AppShell active="life-updates" current={current}>
        <PageHeader
          description="Change the shared story or photos. Its audience cannot be changed."
          eyebrow="Life Update"
          title="Edit update"
        />
        <LifeUpdateEditor update={update} />
      </AppShell>
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
}
