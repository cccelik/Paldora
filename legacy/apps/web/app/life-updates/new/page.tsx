import { AppShell } from '../../components/app-shell';
import { LifeUpdateComposer } from '../../components/life-update-composer';
import { PageHeader } from '../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../lib/api';

export default async function NewLifeUpdatePage() {
  const current = await loadCompletedCurrentUser();
  const boxes = (await (await authenticatedApiClient()).boxes()).filter(
    ({ status }) => status === 'active',
  );
  return (
    <AppShell active="life-updates" current={current}>
      <PageHeader
        eyebrow="Share once, keep every circle private"
        title="New Life Update"
        description="Choose several Boxes for the same update. Each Box gets its own conversation."
      />
      <LifeUpdateComposer boxes={boxes} />
    </AppShell>
  );
}
