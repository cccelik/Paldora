import 'server-only';

import { uuidSchema, type MediaAssetView } from '@paldora/validation';
import { actionError, type ActionOutcome } from './action-result';

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
