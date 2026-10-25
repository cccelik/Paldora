import {
  type LifeUpdateView,
  type MemorySummaryView,
  type PostView,
  type RoomPhotoView,
  type RoomView,
} from '@paldora/validation';
export interface RoomPreviews {
  readonly posts: readonly PostView[] | null;
  readonly lifeUpdates: readonly LifeUpdateView[] | null;
  readonly photos: readonly RoomPhotoView[] | null;
  readonly memories: MemorySummaryView | null;
  readonly memoryCalendar?: boolean | undefined;
}
export const ROOM_PHOTO_PREVIEW_COUNT = 6;
export interface WidgetProps {
  readonly room: RoomView;
  readonly previews: RoomPreviews;
  readonly isOwner: boolean;
}
