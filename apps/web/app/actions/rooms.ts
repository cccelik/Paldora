'use server';

import {
  actionError,
  invalidOutcome,
  type ActionOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { runFormWithData } from '@/lib/actions/action-runner';
import { textField } from '@/lib/actions/form-data';
import { photoCopy, reservePhotoUpload } from '@/lib/media/media-asset-action';
import { mediaActionClient } from '@/lib/media/media-service';
import {
  PHOTO_FILE_MESSAGE,
  uploadFileSchema,
  type PreparedUpload,
} from '@/lib/media/upload';
import {
  roomBannerInputSchema,
  roomSettingsFormSchema,
  roomTopFriendsFormSchema,
  roomWidgetsFormSchema,
  SECTION_SAVED,
} from '@/lib/rooms/room-forms';

import { firebaseWebData } from '@/lib/server/firebase/data';
import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import { type RoomView } from '@paldora/validation';
/**
 * Room customizer actions. Each sends the version the editor last saw
 * (`expectedUpdatedAt`) and returns the saved Room, whose `updatedAt` the
 * editor keeps for the next write. A stale version is ROOM_UPDATE_STALE:
 * the editor asks the person to reload and never overwrites silently.
 * Nothing here revalidates the customize page, so a save never re-renders
 * it and drafts in other sections stay as they are.
 */

const roomCopy = {
  ROOM_UPDATE_STALE: 'Not saved: your Room changed somewhere else.',
  TOP_FRIEND_NOT_ELIGIBLE:
    'Someone on the list can’t be a Top Friend right now. Reload to see who you can choose.',
  MEDIA_NOT_FOUND: 'That banner isn’t available any more. Upload it again.',
  MEDIA_NOT_READY: 'Your banner is still being prepared. Try again shortly.',
  RATE_LIMITED:
    'That’s a lot of Room changes at once. Try again in a little while.',
  ROOM_NOT_FOUND: 'Choose a username before you customize your Room.',
};

export async function updateRoomAction(
  _previous: ActionResult<RoomView>,
  formData: FormData,
): Promise<ActionResult<RoomView>> {
  const success = SECTION_SAVED[textField(formData, 'section')] ?? 'Saved.';
  return runFormWithData(
    formData,
    roomSettingsFormSchema,
    (data, body) => data.updateMyRoom(body),
    { success, copy: roomCopy },
  );
}

export async function updateRoomWidgetsAction(
  _previous: ActionResult<RoomView>,
  formData: FormData,
): Promise<ActionResult<RoomView>> {
  return runFormWithData(
    formData,
    roomWidgetsFormSchema,
    (data, body) => data.updateMyRoomWidgets(body),
    { success: 'Widgets saved.', copy: roomCopy },
  );
}

export async function updateRoomTopFriendsAction(
  _previous: ActionResult<RoomView>,
  formData: FormData,
): Promise<ActionResult<RoomView>> {
  return runFormWithData(
    formData,
    roomTopFriendsFormSchema,
    (data, body) => data.updateMyRoomTopFriends(body),
    { success: 'Top Friends saved.', copy: roomCopy },
  );
}

const bannerFileSchema = uploadFileSchema('room_banner');

const bannerUploadCopy = {
  ...photoCopy,
  RATE_LIMITED:
    'You’ve uploaded a lot of banners this hour. Try again later; your current banner stays.',
};

/** Reserves a signed upload for a banner (user-scoped `room_banner`). */
export async function prepareRoomBanner(
  input: unknown,
): Promise<ActionOutcome<PreparedUpload>> {
  const parsed = bannerFileSchema.safeParse(input);
  if (!parsed.success) {
    return invalidOutcome(PHOTO_FILE_MESSAGE);
  }
  const api = await mediaActionClient();
  return reservePhotoUpload(
    () => api.createMediaUpload({ purpose: 'room_banner', ...parsed.data }),
    bannerUploadCopy,
  );
}

/**
 * Attaches a ready banner upload (an id) or removes the banner (null), as
 * one Room write with the editor's version. The API retires the old one.
 */
export async function saveRoomBanner(
  input: unknown,
): Promise<ActionOutcome<RoomView>> {
  const parsed = roomBannerInputSchema.safeParse(input);
  if (!parsed.success) return actionError(new Error('invalid banner'));
  try {
    const room = await (async () => {
      await requireFirebaseActionOrigin();
      return (await firebaseWebData()).updateMyRoom(parsed.data);
    })();
    return {
      status: 'success',
      message:
        parsed.data.bannerMediaId === null
          ? 'Banner removed.'
          : 'Banner saved.',
      data: room,
    };
  } catch (error) {
    return actionError(error, roomCopy);
  }
}
