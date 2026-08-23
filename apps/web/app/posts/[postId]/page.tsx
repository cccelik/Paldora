import { ApiClientError } from '@paldora/api-client';
import type { PostId } from '@paldora/domain';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { PostFeed } from '../../components/post-feed';
import { PostRealtimeRefresh } from '../../components/post-realtime-refresh';
import { PageHeader } from '../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function PostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { postId } = await params;
  let post;
  try {
    post = await (await authenticatedApiClient()).post(postId as PostId);
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status === 404 &&
      error.code === 'POST_NOT_FOUND'
    ) {
      notFound();
    }
    throw error;
  }
  return (
    <AppShell current={current} active="boxes">
      <PostRealtimeRefresh boxId={post.boxId} />
      <PageHeader
        eyebrow="Private Box post"
        title={post.boxName}
        description="Only active Box members can view this shared post."
        trailing={
          <Link className="button-quiet" href={`/boxes/${post.boxId}`}>
            Open Box
          </Link>
        }
      />
      <PostFeed
        currentUserId={current.user.id}
        nextCursor={null}
        posts={[post]}
        returnPath={`/posts/${post.id}`}
      />
    </AppShell>
  );
}
