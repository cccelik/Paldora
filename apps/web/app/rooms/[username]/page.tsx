import { ApiClientError } from '@paldora/api-client';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { RoomCanvas } from '../../components/room-canvas';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../lib/api';
import { roomCustomizePath } from '../../lib/room-paths';

export const dynamic = 'force-dynamic';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const current = await loadCompletedCurrentUser();
  const api = await authenticatedApiClient();
  try {
    const room = await api.room(username);
    const [posts, lifeUpdates, gallery, memories] = await Promise.all([
      api.roomPosts(username, { limit: 8 }),
      api.roomLifeUpdates(username, { limit: 6 }),
      api.roomGallery(username, { limit: 8 }),
      api.roomMemories(username, { limit: 6 }),
    ]);
    const isOwner = room.viewerRelationship === 'owner';
    return (
      <AppShell active="room" current={current}>
        <div className="room-trusted-toolbar">
          <span className="privacy-pill">
            {room.visibility === 'friends'
              ? 'Friends Only'
              : room.visibility === 'members'
                ? 'Paldora Members'
                : 'Only Me'}
          </span>
          {isOwner ? (
            <Link
              className="button-secondary"
              href={roomCustomizePath(username)}
            >
              Customize Room
            </Link>
          ) : (
            <span className="relationship-pill">
              {room.viewerRelationship === 'friend'
                ? 'Friends'
                : 'Paldora member'}
            </span>
          )}
        </div>
        <RoomCanvas
          gallery={gallery}
          lifeUpdates={lifeUpdates}
          memories={memories}
          posts={posts}
          room={room}
        />
      </AppShell>
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
}
