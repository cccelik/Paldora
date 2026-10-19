import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { RoomEditor } from '../../../components/room-editor';
import { PageHeader } from '../../../components/ui';
import {
  authenticatedApiClient,
  loadCompletedCurrentUser,
} from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function CustomizeRoomPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const current = await loadCompletedCurrentUser();
  if (current.profile.username !== username) notFound();
  const api = await authenticatedApiClient();
  const [room, friends] = await Promise.all([api.myRoom(), api.friends()]);
  return (
    <AppShell active="room" current={current}>
      <PageHeader
        description="Change the Room canvas while Paldora keeps navigation, privacy, and account controls trusted."
        eyebrow="Safe personalization"
        title="Customize your Room"
      />
      <RoomEditor friends={friends} initialRoom={room} />
    </AppShell>
  );
}
