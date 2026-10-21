import { actionError, type ActionOutcome } from '@/lib/actions/action-result';
import { type PreparedUpload } from '@/lib/media/upload';
import { uuidSchema, type MediaAssetView } from '@paldora/validation';
import 'server-only';
/**
 * One call about an upload the person owns (complete, or read its status),
 * answered with the asset's status. Shared by the photo and camera actions.
 */
export async function assetStatusOutcome(
  mediaAssetId: unknown,
  call: (id: string) => Promise<MediaAssetView>,
  copy: Readonly<Partial<Record<string, string>>>,
): Promise<ActionOutcome<MediaAssetView['status']>> {
  const id = uuidSchema.safeParse(mediaAssetId);
  if (!id.success) return actionError(new Error('invalid id'));
  try {
    const asset = await call(id.data);
    return { status: 'success', message: asset.status, data: asset.status };
  } catch (error) {
    return actionError(error, copy);
  }
}

/** What a reserved upload hands the browser: where to PUT, and how. */

export const photoCopy = {
  MEDIA_UPLOAD_MISMATCH: 'That photo didn’t upload completely. Try again.',
  MEDIA_UPLOAD_EXPIRED: 'The upload took too long. Try again.',
  STORAGE_UNAVAILABLE: 'Photos are unavailable right now. Try again shortly.',
  BOX_ARCHIVED: 'This Box is archived, so it can’t take new photos.',
  RATE_LIMITED: 'That’s a lot of photos at once. Try again in a little while.',
};

/**
 * Reserves a signed upload for one already-validated photo, through the
 * generic media flow: the purpose decides whether it is Box- or user-scoped.
 */
export async function reservePhotoUpload(
  reserve: () => Promise<{
    mediaAsset: { id: string };
    upload: { url: string; headers: Readonly<Record<string, string>> };
  }>,
  copy: Readonly<Partial<Record<string, string>>> = photoCopy,
): Promise<ActionOutcome<PreparedUpload>> {
  try {
    const { mediaAsset, upload } = await reserve();
    return {
      status: 'success',
      message: 'Upload ready.',
      data: {
        mediaAssetId: mediaAsset.id,
        url: upload.url,
        headers: upload.headers,
      },
    };
  } catch (error) {
    return actionError(error, copy);
  }
}
