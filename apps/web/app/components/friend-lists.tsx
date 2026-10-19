import type { BlockedUserView, FriendshipView } from '@paldora/validation';
import {
  acceptFriendRequestAction,
  blockPersonAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  removeFriendAction,
  unblockPersonAction,
} from '../actions/social';
import { ConfirmAction } from './confirm-action';
import { PersonList, PersonRow } from './person-row';
import { RowActionForm } from './row-action-form';
import { Badge, EmptyState } from './ui';

export function FriendRequestList({
  items,
}: {
  items: readonly FriendshipView[];
}) {
  if (items.length === 0) {
    return <EmptyState>No requests waiting.</EmptyState>;
  }
  return (
    <PersonList label="Friend requests">
      {items.map((request) => (
        <PersonRow
          key={request.id}
          person={request.user}
          note={
            request.direction === 'outgoing' ? (
              <Badge>Waiting for a reply</Badge>
            ) : null
          }
        >
          {request.direction === 'incoming' ? (
            <>
              <RowActionForm
                action={acceptFriendRequestAction}
                fields={{ friendshipId: request.id }}
                label="Accept"
                pendingLabel="Accepting…"
                variant="primary"
              />
              <RowActionForm
                action={declineFriendRequestAction}
                fields={{ friendshipId: request.id }}
                label="Decline"
                pendingLabel="Declining…"
              />
            </>
          ) : (
            <RowActionForm
              action={cancelFriendRequestAction}
              fields={{ friendshipId: request.id }}
              label="Withdraw"
              pendingLabel="Withdrawing…"
            />
          )}
        </PersonRow>
      ))}
    </PersonList>
  );
}

export function FriendList({ items }: { items: readonly FriendshipView[] }) {
  if (items.length === 0) {
    return (
      <EmptyState>No friends yet. Send a request by username above.</EmptyState>
    );
  }
  return (
    <PersonList label="Friends">
      {items.map((friendship) => (
        <PersonRow key={friendship.id} person={friendship.user}>
          <ConfirmAction
            action={removeFriendAction}
            fields={{ userId: friendship.user.id }}
            label="Remove"
            prompt={`Remove ${friendship.user.displayName} as a friend? Boxes you share stay as they are.`}
            confirmLabel="Yes, remove"
            pendingLabel="Removing…"
          />
          <ConfirmAction
            action={blockPersonAction}
            fields={{ username: friendship.user.username }}
            label="Block"
            prompt={`Block ${friendship.user.displayName}? You’ll stop being friends, and neither of you can reach the other.`}
            confirmLabel="Yes, block"
            pendingLabel="Blocking…"
          />
        </PersonRow>
      ))}
    </PersonList>
  );
}

export function BlockedList({ items }: { items: readonly BlockedUserView[] }) {
  if (items.length === 0) {
    return <EmptyState>You haven’t blocked anyone.</EmptyState>;
  }
  return (
    <PersonList label="Blocked people">
      {items.map((blocked) => (
        <PersonRow key={blocked.userId} person={blocked}>
          <RowActionForm
            action={unblockPersonAction}
            fields={{ userId: blocked.userId }}
            label="Unblock"
            pendingLabel="Unblocking…"
          />
        </PersonRow>
      ))}
    </PersonList>
  );
}
