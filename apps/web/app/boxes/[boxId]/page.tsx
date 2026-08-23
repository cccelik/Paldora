import type { BoxId } from '@paldora/domain';
import { ApiClientError } from '@paldora/api-client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { BoxInvitePanel } from '../../components/box-invite-panel';
import { BoxMemberPanel } from '../../components/box-member-panel';
import { BoxSettingsPanel } from '../../components/box-settings-panel';
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
    notice?: string;
  }>;
}) {
  const current = await loadCompletedCurrentUser();
  const { boxId } = await params;
  const notices = await searchParams;
  const api = await authenticatedApiClient();
  let box;
  let members;
  let friends;
  let friendRequests;
  let blockedUsers;
  let postPage;
  try {
    [box, members, friends, friendRequests, blockedUsers, postPage] =
      await Promise.all([
        api.box(boxId as BoxId),
        api.boxMembers(boxId as BoxId),
        api.friends(),
        api.friendRequests(),
        api.blockedUsers(),
        api.boxPosts(boxId as BoxId, {
          ...(notices.cursor ? { cursor: notices.cursor } : {}),
          limit: 20,
        }),
      ]);
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
  const canInvite =
    box.status === 'active' &&
    (box.currentUserRole === 'owner' || box.currentUserRole === 'admin');
  const pendingInvitations = canInvite
    ? await api.pendingBoxInvitees(box.id)
    : { inviteeUserIds: [] };
  const socialConnectionUserIds = [
    ...friends,
    ...friendRequests,
    ...blockedUsers,
  ].map((connection) => connection.user.id);
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
          <Link className="button-quiet" href="/boxes">
            All Boxes
          </Link>
        }
      />
      <PageFeedback error={notices.error} notice={notices.notice} />
      <div className="box-detail-layout">
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
        <aside className="settings-side">
          {canInvite && (
            <BoxInvitePanel
              boxId={box.id}
              friends={friends}
              memberUserIds={members.map((member) => member.userId)}
              pendingInviteeUserIds={pendingInvitations.inviteeUserIds}
            />
          )}
          <BoxMemberPanel
            boxId={box.id}
            currentUserId={current.user.id}
            currentUserRole={box.currentUserRole}
            members={members}
            socialConnectionUserIds={socialConnectionUserIds}
          />
          {box.currentUserRole === 'owner' && <BoxSettingsPanel box={box} />}
        </aside>
      </div>
    </AppShell>
  );
}
