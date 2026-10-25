import { createHash } from 'node:crypto';
import styles from '@/(signed-in)/rooms/[username]/page.module.css';
import { ReportControl } from '@/components/moderation/report-control';
import { RoomCanvas } from '@/components/rooms/room-canvas';
import { RoomOwnerStrip } from '@/components/rooms/room-owner-strip';
import { loadRoomPreviews } from '@/lib/rooms/room-previews';
import { roomUsernameParam } from '@/lib/rooms/room-theme';
import { ROOM_ABSENT } from '@/lib/server/route-params';
import { completedUser, orNotFound } from '@/lib/server/session';
import { firebaseWebData } from '@/lib/server/firebase/data';
import { notFound } from 'next/navigation';
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
  const api = await firebaseWebData();
  const room = await orNotFound(api.room(username), ROOM_ABSENT);
  const [previews, personalization] = await Promise.all([
    loadRoomPreviews(api, room),
    orNotFound(api.roomPersonalization(username), ROOM_ABSENT),
  ]);
  const cssRevision = createHash('sha256')
    .update(personalization.css)
    .digest('hex')
    .slice(0, 16);
  return (
    <div className={styles.page}>
      {personalization.css ? (
        <link
          rel="stylesheet"
          href={`/rooms/${encodeURIComponent(username)}/personalization.css?v=${cssRevision}`}
        />
      ) : null}
      <RoomOwnerStrip room={room} />
      <RoomCanvas
        personalization={personalization}
        room={room}
        previews={previews}
      />
      {room.relationship !== 'owner' ? (
        <ReportControl targetKind="user" targetId={room.owner.id} />
      ) : null}
    </div>
  );
}
