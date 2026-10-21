'use client';

import {
  DEFAULT_ROOM,
  TOP_FRIENDS_SIZES,
  TOP_FRIENDS_VISIBILITIES,
  TOP_FRIENDS_VISIBILITY_DESCRIPTIONS,
  TOP_FRIENDS_VISIBILITY_LABELS,
  type TopFriendsSize,
  type TopFriendsVisibility,
} from '@paldora/domain';
import type { RoomView, UserSummary } from '@paldora/validation';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { updateRoomTopFriendsAction } from '../actions/rooms';
import {
  friendsToAdd,
  moveItem,
  movedAnnouncement,
  topFriendsProblem,
} from '../lib/room-editor';
import {
  EditorSection,
  MoveButtons,
  RoomSaveButton,
  RoomSectionFeedback,
  RoomVersionField,
} from './room-editor-parts';
import { Avatar, Button } from './ui';
import { useMoveFocus } from './use-move-focus';
import { useRoomSave, type RoomSaveContext } from './use-room-save';
import styles from './room-editor.module.css';

interface TopFriendsDraft {
  readonly chosen: readonly UserSummary[];
  readonly size: TopFriendsSize;
  readonly visibility: TopFriendsVisibility;
}

const topFriendsDraft = (room: RoomView): TopFriendsDraft => ({
  chosen: room.topFriends.items ?? [],
  size: room.topFriends.size ?? DEFAULT_ROOM.topFriendsSize,
  visibility: room.topFriends.visibility ?? DEFAULT_ROOM.topFriendsVisibility,
});

function AddFriend({
  candidates,
  full,
  hasFriends,
  onAdd,
}: {
  candidates: readonly UserSummary[];
  full: boolean;
  hasFriends: boolean;
  onAdd: (friend: UserSummary) => void;
}) {
  const [choice, setChoice] = useState('');
  if (!hasFriends) {
    return (
      <p className={styles.hint}>
        Top Friends come from your accepted friends.{' '}
        <Link href={'/friends' as Route}>Add friends</Link> first.
      </p>
    );
  }
  if (full) {
    return (
      <p className={styles.hint}>
        Your Top Friends are full. Remove someone or choose a bigger size.
      </p>
    );
  }
  if (candidates.length === 0) {
    return <p className={styles.hint}>Every friend is already on the list.</p>;
  }
  const picked = candidates.find((friend) => friend.id === choice);
  return (
    <div className={styles.add}>
      <div className={styles.control}>
        <label className={styles.label} htmlFor="customize-top-friend-add">
          Add a friend
        </label>
        <select
          id="customize-top-friend-add"
          className={styles.select}
          value={picked ? picked.id : ''}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Choose a friend</option>
          {candidates.map((friend) => (
            <option key={friend.id} value={friend.id}>
              {friend.displayName} (@{friend.username})
            </option>
          ))}
        </select>
      </div>
      <Button
        variant="secondary"
        disabled={!picked}
        onClick={() => {
          if (!picked) return;
          onAdd(picked);
          setChoice('');
        }}
      >
        Add
      </Button>
    </div>
  );
}

function SizeAndAudience({
  draft,
  onChange,
}: {
  draft: TopFriendsDraft;
  onChange: (patch: Partial<TopFriendsDraft>) => void;
}) {
  return (
    <>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>How many</legend>
        <div className={styles.sizes}>
          {TOP_FRIENDS_SIZES.map((size) => (
            <label key={size} className={styles.option}>
              <input
                type="radio"
                name="size"
                value={size}
                checked={draft.size === size}
                onChange={() => onChange({ size })}
              />
              <span className={styles.optionLabel}>Top {size}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Who sees them</legend>
        {TOP_FRIENDS_VISIBILITIES.map((visibility) => (
          <label key={visibility} className={styles.option}>
            <input
              type="radio"
              name="visibility"
              value={visibility}
              checked={draft.visibility === visibility}
              onChange={() => onChange({ visibility })}
            />
            <span>
              <span className={styles.optionLabel}>
                {TOP_FRIENDS_VISIBILITY_LABELS[visibility]}
              </span>
              <span className={styles.optionDetail}>
                {TOP_FRIENDS_VISIBILITY_DESCRIPTIONS[visibility]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

/**
 * Top Friends: choose accepted friends, order them with Move up / Move
 * down, and pick the size and audience. Saving replaces the list. Someone
 * you unfriend or block leaves the list on their own; the API decides who
 * is eligible (TOP_FRIEND_NOT_ELIGIBLE otherwise).
 */
export function RoomTopFriendsEditor({
  room,
  friends,
  moreFriends,
  context,
}: {
  room: RoomView;
  friends: readonly UserSummary[];
  moreFriends: boolean;
  context: RoomSaveContext;
}) {
  const [draft, setDraft] = useState(() => topFriendsDraft(room));
  const [state, action] = useRoomSave(
    updateRoomTopFriendsAction,
    context,
    (saved) => setDraft(topFriendsDraft(saved)),
  );
  const focus = useMoveFocus();
  const change = (patch: Partial<TopFriendsDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const { chosen } = draft;
  const problem = topFriendsProblem(chosen.length, draft.size);
  const lockedId = 'customize-top-friends-locked';
  const problemId = 'customize-top-friends-problem';

  const move = (index: number, delta: -1 | 1) => {
    const next = moveItem(chosen, index, delta);
    const friend = chosen[index];
    if (!next || !friend) return;
    change({ chosen: next });
    focus.moved(
      friend.id,
      delta,
      movedAnnouncement(friend.displayName, index + delta, next.length),
    );
  };

  return (
    <EditorSection
      id="customize-top-friends"
      title="Top Friends"
      description="Friends you choose to show on your Room, in your order. Nobody is told when you add them."
    >
      <form action={action} className={styles.form}>
        <RoomVersionField context={context} />
        <input
          type="hidden"
          name="userIds"
          value={JSON.stringify(chosen.map((friend) => friend.id))}
        />
        <SizeAndAudience draft={draft} onChange={change} />
        {chosen.length === 0 ? (
          <p className={styles.hint}>No Top Friends chosen yet.</p>
        ) : (
          <ol
            ref={focus.list}
            className={styles.rows}
            aria-label="Top Friends order"
          >
            {chosen.map((friend, index) => (
              <li key={friend.id} className={styles.row}>
                <span className={styles.rowName}>
                  <Avatar url={friend.avatarUrl} name={friend.displayName} />
                  <span>
                    {index + 1}. {friend.displayName}
                  </span>
                </span>
                <MoveButtons
                  name={friend.displayName}
                  index={index}
                  total={chosen.length}
                  moveKey={friend.id}
                  onMove={(delta) => move(index, delta)}
                />
                <Button
                  variant="quiet"
                  onClick={() => {
                    change({
                      chosen: chosen.filter((each) => each !== friend),
                    });
                    focus.announce(`${friend.displayName} removed.`);
                  }}
                >
                  Remove
                  <span className="visually-hidden"> {friend.displayName}</span>
                </Button>
              </li>
            ))}
          </ol>
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {focus.announcement}
        </p>
        <AddFriend
          candidates={friendsToAdd(friends, chosen)}
          full={chosen.length >= draft.size}
          hasFriends={friends.length > 0 || chosen.length > 0}
          onAdd={(friend) => {
            change({ chosen: [...chosen, friend] });
            focus.announce(`${friend.displayName} added.`);
          }}
        />
        {moreFriends ? (
          <p className={styles.hint}>The list shows your first 200 friends.</p>
        ) : null}
        {problem ? (
          <p className={styles.invalid} id={problemId}>
            {problem}
          </p>
        ) : null}
        <RoomSectionFeedback
          state={state}
          context={context}
          lockedId={lockedId}
        />
        <div className={styles.actions}>
          <RoomSaveButton
            context={context}
            lockedId={lockedId}
            disabled={problem !== null}
            describedBy={problem ? problemId : undefined}
          >
            Save Top Friends
          </RoomSaveButton>
        </div>
      </form>
    </EditorSection>
  );
}
