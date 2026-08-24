import { AppearanceForm } from '../../components/appearance-form';
import { AppShell } from '../../components/app-shell';
import { PageHeader, SurfaceCard } from '../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function AppearanceSettingsPage() {
  const current = await loadCompletedCurrentUser();
  const preferences = await (await authenticatedApiClient()).preferences();
  return (
    <AppShell active="settings" current={current}>
      <PageHeader
        description="Choose how Paldora looks on this account. Room themes remain independent."
        eyebrow="Display"
        title="Appearance"
      />
      <SurfaceCard title="Light, Dark, or System">
        <AppearanceForm initial={preferences.appearance} />
      </SurfaceCard>
    </AppShell>
  );
}
