'use client';

import type { BoxId, Friendship, UserId } from '@paldora/domain';
import { useRef } from 'react';
import { inviteToBoxAction } from '../actions/social';
import { boxInviteOptions, type BoxInviteOption } from '../lib/box-invitations';
import { InitialAvatar, SurfaceCard, UsernameField } from './ui';
import { PendingSubmitButton } from './pending-submit-button';

const visibleFriendLimit = 5;

export function BoxInvitePanel({
  boxId,
  friends,
  memberUserIds,
  pendingInviteeUserIds = [],
}: {
  boxId: BoxId;
  friends: readonly Friendship[];
  memberUserIds: readonly UserId[];
  pendingInviteeUserIds?: readonly UserId[];
}) {
  const options = boxInviteOptions(friends, memberUserIds);
  const pendingInvitees = new Set(pendingInviteeUserIds);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <SurfaceCard title="Invite people">
      {options.length > 0 ? (
        <>
          <FriendInviteList
            boxId={boxId}
            friends={options.slice(0, visibleFriendLimit)}
            pendingInvitees={pendingInvitees}
          />
          {options.length > visibleFriendLimit && (
            <button
              className="button-secondary full-width show-all-friends"
              type="button"
              aria-haspopup="dialog"
              onClick={() => dialog.current?.showModal()}
            >
              Show all friends ({options.length})
            </button>
          )}
          <p className="invite-picker-caption">
            Friends who are not already members appear here for quick access.
          </p>
          <dialog
            aria-labelledby="all-friends-title"
            className="friends-dialog"
            ref={dialog}
          >
            <div className="friends-dialog-header">
              <div>
                <p className="eyebrow">Your people</p>
                <h2 id="all-friends-title">Invite friends</h2>
              </div>
              <button
                className="button-quiet friends-dialog-close"
                type="button"
                aria-label="Close friend list"
                onClick={() => dialog.current?.close()}
              >
                ×
              </button>
            </div>
            <FriendInviteList
              boxId={boxId}
              friends={options}
              pendingInvitees={pendingInvitees}
            />
          </dialog>
        </>
      ) : (
        <p className="invite-picker-empty">
          Your friends are already here, or you have no accepted friends yet.
          You can still invite anyone by username below.
        </p>
      )}
      <details className="block-controls invite-fallback">
        <summary>Invite anyone by username</summary>
        <form
          className="form-stack"
          action={inviteToBoxAction.bind(null, boxId)}
        >
          <UsernameField
            required
            placeholder="their_username"
            help="They do not need to be your friend. They will receive a Box invitation to accept or decline."
          />
          <PendingSubmitButton
            className="button-secondary full-width"
            pendingChildren="Invited"
          >
            Invite by username
          </PendingSubmitButton>
        </form>
      </details>
    </SurfaceCard>
  );
}

function FriendInviteList({
  boxId,
  friends,
  pendingInvitees,
}: {
  boxId: BoxId;
  friends: readonly BoxInviteOption[];
  pendingInvitees: ReadonlySet<UserId>;
}) {
  return (
    <ul className="invite-friend-list">
      {friends.map((friend) => {
        const invited = pendingInvitees.has(friend.userId);
        return (
          <li key={friend.userId}>
            <InitialAvatar name={friend.label} imageUrl={friend.avatarUrl} />
            <div className="invite-friend-copy">
              <strong>{friend.label}</strong>
              <span>@{friend.username}</span>
            </div>
            <form action={inviteToBoxAction.bind(null, boxId)}>
              <input type="hidden" name="username" value={friend.username} />
              <PendingSubmitButton
                className="button-primary compact-button"
                disabled={invited}
                pendingChildren="Invited"
              >
                {invited ? 'Invited' : 'Invite'}
              </PendingSubmitButton>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
