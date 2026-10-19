import Link from 'next/link';
import { AppShell } from '../components/app-shell';
import { LifeUpdateFeed } from '../components/life-update-card';
import { PageHeader } from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function LifeUpdatesPage() {
  const current = await loadCompletedCurrentUser();
  const updates = await (
    await authenticatedApiClient()
  ).lifeUpdates({ limit: 20 });
  return (
    <AppShell active="life-updates" current={current}>
      <PageHeader
        eyebrow="The longer story"
        title="Your Life Updates"
        description="The longer stories you have shared, including private Only Me notes."
        trailing={
          <Link className="button-primary" href="/life-updates/new">
            Write a Life Update
          </Link>
        }
      />
      {updates.items.length > 0 ? (
        <LifeUpdateFeed
          currentUserId={current.user.id}
          reactionPresets={current.profile.reactionPresets}
          updates={updates.items}
        />
      ) : (
        <section className="post-feed-empty">
          <div>♡</div>
          <h2>No Life Updates yet.</h2>
          <p>Share what life has looked like lately when you are ready.</p>
        </section>
      )}
    </AppShell>
  );
}
