'use client';

import type {
  Friendship,
  RoomView,
  TopFriendsSize,
  TopFriendsVisibility,
  UserId,
} from '@paldora/domain';
import { useMemo, useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import { InitialAvatar } from './ui';

export function RoomTopFriendsEditor({
  room,
  friends,
  onChange,
}: {
  room: RoomView;
  friends: Friendship[];
  onChange: (room: RoomView) => void;
}) {
  const [selected, setSelected] = useState<UserId[]>(
    room.topFriends.map(({ userId }) => userId),
  );
  const [size, setSize] = useState<TopFriendsSize>(room.topFriendsSize);
  const [visibility, setVisibility] = useState<TopFriendsVisibility>(
    room.topFriendsVisibility,
  );
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return friends.filter(({ user }) =>
      `${user.displayName ?? ''} ${user.username ?? ''}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [friends, query]);

  function toggle(userId: UserId, checked: boolean) {
    setMessage(null);
    if (!checked) {
      setSelected((current) => current.filter((id) => id !== userId));
      return;
    }
    setSelected((current) =>
      current.length >= size ? current : [...current, userId],
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    setSelected((current) => {
      const reordered = [...current];
      [reordered[index], reordered[target]] = [
        reordered[target]!,
        reordered[index]!,
      ];
      return reordered;
    });
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await createBrowserApiClient().updateRoomTopFriends({
        userIds: selected,
        size,
        visibility,
        expectedUpdatedAt: room.updatedAt,
      });
      onChange(saved);
      setMessage('My people saved.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Your people could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  const friendById = new Map(friends.map((friend) => [friend.user.id, friend]));
  return (
    <section className="room-editor-section">
      <h2>My people</h2>
      <TopFriendsSettings
        onSizeChange={(next) => {
          setSize(next);
          setSelected((current) => current.slice(0, next));
        }}
        onVisibilityChange={setVisibility}
        size={size}
        visibility={visibility}
      />
      <label>
        Find a friend
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search friends"
          value={query}
        />
      </label>
      <FriendPicker
        filtered={filtered}
        onToggle={toggle}
        selected={selected}
        size={size}
      />
      <SelectedFriends
        friendById={friendById}
        onMove={move}
        selected={selected}
      />
      <button
        className="button-secondary"
        disabled={busy}
        onClick={() => void save()}
        type="button"
      >
        {busy ? 'Saving…' : 'Save My people'}
      </button>
      {message && (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function TopFriendsSettings({
  size,
  visibility,
  onSizeChange,
  onVisibilityChange,
}: {
  size: TopFriendsSize;
  visibility: TopFriendsVisibility;
  onSizeChange: (size: TopFriendsSize) => void;
  onVisibilityChange: (visibility: TopFriendsVisibility) => void;
}) {
  return (
    <div className="form-grid-two">
      <label>
        Layout
        <select
          onChange={(event) =>
            onSizeChange(Number(event.target.value) as TopFriendsSize)
          }
          value={size}
        >
          <option value={4}>Top 4</option>
          <option value={8}>Top 8</option>
          <option value={12}>Top 12</option>
        </select>
      </label>
      <label>
        Visibility
        <select
          onChange={(event) =>
            onVisibilityChange(event.target.value as TopFriendsVisibility)
          }
          value={visibility}
        >
          <option value="visible">Visible</option>
          <option value="friends">Friends only</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>
    </div>
  );
}

function FriendPicker({
  filtered,
  selected,
  size,
  onToggle,
}: {
  filtered: Friendship[];
  selected: UserId[];
  size: TopFriendsSize;
  onToggle: (userId: UserId, checked: boolean) => void;
}) {
  return (
    <div className="room-friend-picker">
      {filtered.map((friend) => (
        <label key={friend.user.id}>
          <input
            checked={selected.includes(friend.user.id)}
            disabled={
              !selected.includes(friend.user.id) && selected.length >= size
            }
            onChange={(event) => onToggle(friend.user.id, event.target.checked)}
            type="checkbox"
          />
          <InitialAvatar
            imageUrl={friend.user.avatarUrl}
            length={1}
            name={friend.user.displayName ?? friend.user.username ?? 'Friend'}
          />
          <span>
            <strong>{friend.user.displayName}</strong>
            <small>@{friend.user.username}</small>
          </span>
        </label>
      ))}
      {!filtered.length && <p>No matching friends.</p>}
    </div>
  );
}

function SelectedFriends({
  selected,
  friendById,
  onMove,
}: {
  selected: UserId[];
  friendById: Map<UserId, Friendship>;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  if (!selected.length) return null;
  return (
    <ol className="room-selected-friends">
      {selected.map((id, index) => {
        const friend = friendById.get(id);
        return (
          <li key={id}>
            <span>{friend?.user.displayName ?? friend?.user.username}</span>
            <button
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label="Move down"
              disabled={index === selected.length - 1}
              onClick={() => onMove(index, 1)}
              type="button"
            >
              ↓
            </button>
          </li>
        );
      })}
    </ol>
  );
}
