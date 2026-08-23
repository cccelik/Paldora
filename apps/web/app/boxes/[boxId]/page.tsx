import type { BoxId } from '@paldora/domain';
import { ApiClientError } from '@paldora/api-client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { BoxInvitePanel } from '../../components/box-invite-panel';
import { BoxMemberPanel } from '../../components/box-member-panel';
import { BoxSettingsPanel } from '../../components/box-settings-panel';
import { EmptyState, PageFeedback, PageHeader } from '../../components/ui';
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
  searchParams: Promise<{ error?: string; notice?: string }>;
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
  try {
    [box, members, friends, friendRequests, blockedUsers] = await Promise.all([
      api.box(boxId as BoxId),
      api.boxMembers(boxId as BoxId),
      api.friends(),
      api.friendRequests(),
      api.blockedUsers(),
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
        <EmptyState
          className="box-feed-empty"
          eyebrow="The Box is ready"
          title="Stories come in the next phase."
          description="Membership and privacy are live. Posts are intentionally not simulated until the feed milestone."
        />
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
