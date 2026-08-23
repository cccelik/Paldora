import { AppShell } from '../components/app-shell';
import { EmptyState, InitialAvatar, PageHeader } from '../components/ui';
import { loadCompletedCurrentUser } from '../lib/api';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const current = await loadCompletedCurrentUser();
  return (
    <AppShell current={current} active="home">
      <PageHeader
        eyebrow="Your private corner"
        title="Home"
        description="Latest from your people"
        trailing={
          <InitialAvatar
            className="header-avatar"
            name={current.profile.displayName ?? current.user.email}
            imageUrl={current.profile.avatarUrl}
          />
        }
      />
      <EmptyState
        eyebrow="The beginning"
        title="Your circles arrive next."
        description={
          <>
            Your profile is ready. Boxes, posts, and the chronological feed will
            be introduced in the next product milestones—there is no pretend
            activity here.
          </>
        }
        actions={
          <Link
            className="button-secondary inline-button"
            href="/settings/account"
          >
            Review your profile
          </Link>
        }
      />
    </AppShell>
  );
}
