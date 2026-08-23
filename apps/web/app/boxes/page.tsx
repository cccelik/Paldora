import Link from 'next/link';
import { AppShell } from '../components/app-shell';
import { BoxGrid, BoxInvitationList } from '../components/box-lists';
import { PageFeedback, PageHeader } from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function BoxesPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    warning?: string;
    notice?: string;
  }>;
}) {
  const current = await loadCompletedCurrentUser();
  const notices = await searchParams;
  const api = await authenticatedApiClient();
  const [boxes, invitations] = await Promise.all([
    api.boxes(),
    api.boxInvitations(),
  ]);
  return (
    <AppShell current={current} active="boxes">
      <PageHeader
        className="social-heading"
        eyebrow="Private circles"
        title="Boxes"
        description="Small spaces shared only with the people you choose."
        trailing={
          <Link className="button-primary inline-button" href="/boxes/new">
            Create a Box
          </Link>
        }
      />
      <PageFeedback
        error={notices.error}
        warning={notices.warning}
        notice={notices.notice}
      />

      <BoxInvitationList invitations={invitations} />
      <BoxGrid boxes={boxes} />
    </AppShell>
  );
}
