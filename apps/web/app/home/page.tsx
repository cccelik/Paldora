import { AppShell } from '../components/app-shell';
import { PostFeed } from '../components/post-feed';
import { PostRealtimeRefresh } from '../components/post-realtime-refresh';
import { InitialAvatar, PageFeedback, PageHeader } from '../components/ui';
import { authenticatedApiClient, loadCompletedCurrentUser } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    error?: string;
    warning?: string;
    notice?: string;
  }>;
}) {
  const current = await loadCompletedCurrentUser();
  const query = await searchParams;
  const feed = await (
    await authenticatedApiClient()
  ).feed({
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: 20,
  });
  return (
    <AppShell current={current} active="home">
      <PostRealtimeRefresh />
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
      <PageFeedback
        error={query.error}
        warning={query.warning}
        notice={query.notice}
      />
      <PostFeed
        currentUserId={current.user.id}
        emptyDescription="Join or create a Box, then share the first story with your people."
        emptyTitle="Your chronological feed is quiet."
        nextCursor={feed.nextCursor}
        posts={feed.items}
        returnPath="/home"
      />
    </AppShell>
  );
}
