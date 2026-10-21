import styles from '@/(signed-in)/rooms/[username]/customize/page.module.css';
import { RoomEditor } from '@/components/rooms/room-editor';
import { BackLink, PageHeader } from '@/components/ui';
import { loadFriendChoices, loadRoomPreviews } from '@/lib/rooms/room-previews';
import { roomHref, roomUsernameParam } from '@/lib/rooms/room-theme';
import { ROOM_ABSENT } from '@/lib/server/route-params';
import { apiClient, completedUser, orNotFound } from '@/lib/server/session';
import { normalizeUsername } from '@paldora/validation';
import { type Route } from 'next';
import { notFound } from 'next/navigation';
export const metadata = { title: 'Customize your Room' };

/**
 * The owner's Room customizer. Only the signed-in person's own username
 * opens it: any other name (someone else's, a made-up one, a malformed
 * one) is the same not-found page as a missing Room, before any API call.
 * The API still decides every write (`/me/room…` has no username at all).
 */
export default async function CustomizeRoomPage({
  params,
}: PageProps<'/rooms/[username]/customize'>) {
  const user = await completedUser();
  const username = roomUsernameParam((await params).username);
  const own = user.profile.username;
  if (
    username === null ||
    own === null ||
    normalizeUsername(username) !== normalizeUsername(own)
  ) {
    notFound();
  }
  const api = await apiClient();
  const room = await orNotFound(api.myRoom(), ROOM_ABSENT);
  const [previews, choices] = await Promise.all([
    loadRoomPreviews(api, room, { every: true }),
    loadFriendChoices(api),
  ]);
  return (
    <div className={styles.page}>
      <BackLink href={roomHref(room.owner.username) as Route}>
        Back to your Room
      </BackLink>
      <PageHeader
        title="Customize your Room"
        description="Each section saves on its own. Your Room is yours to style; who can see your posts and Life Updates never changes here."
      />
      <RoomEditor
        room={room}
        previews={previews}
        friends={choices.friends}
        moreFriends={choices.more}
      />
    </div>
  );
}
