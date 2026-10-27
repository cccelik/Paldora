import type { Firestore } from 'firebase-admin/firestore';

/**
 * The opaque avatar media id for a member, exactly when the web adapter would
 * show one (`userSummary`): the profile points at it, the asset is `ready` and
 * owned by that member. It is an id only: never a URL or Storage path. Whether
 * a given viewer may read the bytes is decided again on every media read
 * (`NativeMedia.read`), so a hidden avatar is a 404 there.
 */
export async function readyAvatarMediaId(
  db: Firestore,
  uid: string,
): Promise<string | null> {
  const profile = await db.collection('nativeProfiles').doc(uid).get();
  const id = profile.get('avatarMediaId') as string | null | undefined;
  if (!id) return null;
  const asset = await db.collection('nativeMediaAssets').doc(id).get();
  return asset.get('status') === 'ready' && asset.get('ownerUid') === uid
    ? id
    : null;
}
