import Link from 'next/link';
import { createBoxAction } from '../../actions/social';
import { AppShell } from '../../components/app-shell';
import { FeedbackMessage, PageHeader, SurfaceCard } from '../../components/ui';
import { loadCompletedCurrentUser } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function NewBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { error } = await searchParams;
  return (
    <AppShell current={current} active="boxes">
      <PageHeader
        eyebrow="A new private circle"
        title="Create a Box"
        description="Start with a name. You can invite friends after it is created."
      />
      <SurfaceCard className="focused-form-card">
        <form className="form-stack" action={createBoxAction}>
          <FeedbackMessage tone="error">{error}</FeedbackMessage>
          <label>
            Box name
            <input
              name="name"
              required
              maxLength={80}
              autoFocus
              placeholder="Sunday table"
            />
            <small>1–80 characters. Visible only to Box members.</small>
          </label>
          <div className="form-actions">
            <button className="button-primary" type="submit">
              Create private Box
            </button>
            <Link className="button-quiet" href="/boxes">
              Cancel
            </Link>
          </div>
        </form>
      </SurfaceCard>
    </AppShell>
  );
}
