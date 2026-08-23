import type { Box, BoxMember, Friendship, UserId } from '@paldora/domain';
import Link from 'next/link';
import { BoxInvitePanel } from './box-invite-panel';
import { BoxManagementMenu } from './box-management-menu';
import { BoxMemberPanel } from './box-member-panel';
import { BoxSettingsPanel } from './box-settings-panel';

export function BoxDetailHeaderActions({
  box,
  currentUserId,
  members,
  friends,
  socialConnections,
  pendingInviteeUserIds,
  managementOpen = false,
}: {
  box: Box;
  currentUserId: UserId;
  members: readonly BoxMember[];
  friends: readonly Friendship[];
  socialConnections: readonly Friendship[];
  pendingInviteeUserIds: readonly UserId[];
  managementOpen?: boolean;
}) {
  const canInvite =
    box.status === 'active' &&
    (box.currentUserRole === 'owner' || box.currentUserRole === 'admin');
  return (
    <div className="box-header-actions">
      <Link className="button-quiet" href="/boxes">
        All Boxes
      </Link>
      <BoxManagementMenu openOnMount={managementOpen}>
        {canInvite && (
          <BoxInvitePanel
            boxId={box.id}
            friends={friends}
            memberUserIds={members.map((member) => member.userId)}
            pendingInviteeUserIds={pendingInviteeUserIds}
          />
        )}
        <BoxMemberPanel
          boxId={box.id}
          currentUserId={currentUserId}
          currentUserRole={box.currentUserRole}
          members={members}
          socialConnectionUserIds={socialConnections.map(
            (connection) => connection.user.id,
          )}
        />
        {box.currentUserRole === 'owner' && <BoxSettingsPanel box={box} />}
      </BoxManagementMenu>
    </div>
  );
}
