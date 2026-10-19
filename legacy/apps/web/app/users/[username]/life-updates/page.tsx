import { ApiClientError } from '@paldora/api-client';
import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { LifeUpdateFeed } from '../../../components/life-update-card';
import { PageHeader } from '../../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../../lib/api';

export default async function UserLifeUpdatesPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { username } = await params;
  try {
    const updates = await (
      await authenticatedApiClient()
    ).userLifeUpdates(username, { limit: 20 });
    const displayName = updates.items[0]?.author.displayName ?? `@${username}`;
    return (
      <AppShell active="life-updates" current={current}>
        <PageHeader
          description="Only updates shared through Boxes you can currently access appear here."
          eyebrow={`@${username}`}
          title={`${displayName}'s Life Updates`}
        />
        {updates.items.length > 0 ? (
          <LifeUpdateFeed
            currentUserId={current.user.id}
            reactionPresets={current.profile.reactionPresets}
            returnPath={`/users/${encodeURIComponent(username)}/life-updates`}
            updates={updates.items}
          />
        ) : (
          <section className="post-feed-empty">
            <div aria-hidden="true">♡</div>
            <h2>No visible Life Updates.</h2>
            <p>Nothing shared with your current circles appears here yet.</p>
          </section>
        )}
      </AppShell>
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
}
