'use client';

import type { Friendship, RoomView } from '@paldora/domain';
import { useState } from 'react';
import { RoomTopFriendsEditor } from './room-top-friends-editor';

export function RoomTopFriendsPreview({
  initialRoom,
  friends,
}: {
  initialRoom: RoomView;
  friends: Friendship[];
}) {
  const [room, setRoom] = useState(initialRoom);
  return (
    <RoomTopFriendsEditor friends={friends} onChange={setRoom} room={room} />
  );
}
