import '@paldora/tokens/room-themes.css';
import { RoomCanvas } from '@/components/rooms/room-canvas';
import {
  isRoomThemePreset,
  previewPreviews,
  previewRoom,
} from '@/design-preview/room-fixture';
import { designPreviewEnabled } from '@/lib/server/design-preview';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
export const metadata: Metadata = { title: 'Room theme preview' };

/**
 * The theme stylesheet is imported here because it is otherwise loaded only by
 * the `/rooms` layout; without it the preview renders unthemed.
 *
 * One fake Room in one preset, for the per-theme accessibility run. Local
 * only: any other environment answers 404, like the component gallery.
 */
export default async function RoomThemePreview({
  params,
}: {
  params: Promise<{ theme: string }>;
}) {
  const { theme } = await params;
  if (!designPreviewEnabled() || !isRoomThemePreset(theme)) notFound();
  return (
    <main id="main">
      <RoomCanvas room={previewRoom(theme)} previews={previewPreviews} />
    </main>
  );
}
