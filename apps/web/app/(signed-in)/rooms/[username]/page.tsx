import { notFound } from 'next/navigation';
import { RoomCanvas } from '../../../components/room-canvas';
import { RoomOwnerStrip } from '../../../components/room-owner-strip';
import { loadRoomPreviews } from '../../../lib/room-previews';
import { roomUsernameParam } from '../../../lib/room-theme';
import { ROOM_ABSENT } from '../../../lib/route-params';
import { apiClient, completedUser, orNotFound } from '../../../lib/session';
import styles from './page.module.css';
export const metadata = { title: 'Room' };

/**
 * Someone's Room, as the API says this viewer may see it. Missing,
 * hidden, blocked, and not-allowed are all the same not-found page with a
 * 404, and so is a URL that could never be a username (checked first).
 */
export default async function RoomPage({
  params,
}: PageProps<'/rooms/[username]'>) {
  await completedUser();
  const username = roomUsernameParam((await params).username);
  if (username === null) notFound();
  const api = await apiClient();
  const room = await orNotFound(api.room(username), ROOM_ABSENT);
  const previews = await loadRoomPreviews(api, room);
  return (
    <div className={styles.page}>
      <RoomOwnerStrip room={room} />
      <RoomCanvas room={room} previews={previews} />
    </div>
  );
}
