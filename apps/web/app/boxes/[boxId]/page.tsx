import { ApiClientError, type PaldoraApiClient } from '@paldora/api-client';
import type { BoxId } from '@paldora/domain';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { BoxDetailHeaderActions } from '../../components/box-detail-header-actions';
import { PostComposer } from '../../components/post-composer';
import { PostFeed } from '../../components/post-feed';
import { PostRealtimeRefresh } from '../../components/post-realtime-refresh';
import { PageFeedback, PageHeader } from '../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function BoxDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ boxId: string }>;
  searchParams: Promise<{
    cursor?: string;
    error?: string;
    warning?: string;
    notice?: string;
    manage?: string;
  }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { boxId } = await params;
  const notices = await searchParams;
  const api = await authenticatedApiClient();
  const { box, members, friends, friendRequests, blockedUsers, postPage } =
    await loadBoxDetail(api, boxId as BoxId, notices.cursor);
  const canInvite =
    box.status === 'active' &&
    (box.currentUserRole === 'owner' || box.currentUserRole === 'admin');
  const pendingInvitations = canInvite
    ? await api.pendingBoxInvitees(box.id)
    : { inviteeUserIds: [] };
  const socialConnections = [...friends, ...friendRequests, ...blockedUsers];
  return (
    <AppShell current={current} active="boxes">
      <PostRealtimeRefresh boxId={box.id} />
      <PageHeader
        className="social-heading"
        eyebrow={`Private Box · ${box.currentUserRole} · ${box.status}`}
        title={box.name}
        description={
          <>
            {box.memberCount} {box.memberCount === 1 ? 'member' : 'members'} ·
            only members can see this space
          </>
        }
        trailing={
          <BoxDetailHeaderActions
            box={box}
            currentUserId={current.user.id}
            members={members}
            friends={friends}
            socialConnections={socialConnections}
            pendingInviteeUserIds={pendingInvitations.inviteeUserIds}
            managementOpen={notices.manage === '1'}
          />
        }
      />
      <PageFeedback
        error={notices.error}
        warning={notices.warning}
        notice={notices.notice}
      />
      <div className="box-detail-layout box-feed-layout">
        <div className="box-post-column">
          {box.status === 'active' ? (
            <PostComposer boxId={box.id} />
          ) : (
            <p className="archived-post-notice">
              This Box is archived. Existing posts remain private and readable,
              but new posts are paused until the owner restores it.
            </p>
          )}
          <PostFeed
            currentUserId={current.user.id}
            nextCursor={postPage.nextCursor}
            posts={postPage.items}
            returnPath={`/boxes/${box.id}`}
          />
        </div>
      </div>
    </AppShell>
  );
}

async function loadBoxDetail(
  api: PaldoraApiClient,
  boxId: BoxId,
  cursor?: string,
) {
  try {
    const [box, members, friends, friendRequests, blockedUsers, postPage] =
      await Promise.all([
        api.box(boxId),
        api.boxMembers(boxId),
        api.friends(),
        api.friendRequests(),
        api.blockedUsers(),
        api.boxPosts(boxId, { ...(cursor ? { cursor } : {}), limit: 20 }),
      ]);
    return { box, members, friends, friendRequests, blockedUsers, postPage };
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status === 404 &&
      error.code === 'BOX_NOT_FOUND'
    ) {
      notFound();
    }
    throw error;
  }
}
