import {
  firebaseAdminServices,
  firebaseSessionUid,
} from '@/lib/server/firebase/session';
import {
  logEvent,
  NativeMedia,
  NativeMediaError,
  requestIdFrom,
} from '@paldora/firebase-trusted';
import { uuidSchema } from '@paldora/validation';

export const runtime = 'nodejs';
const noStore = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/** Every read rechecks the session, asset state and canonical visibility. */
export async function GET(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string; variant: string }> },
) {
  const uid = await firebaseSessionUid();
  if (!uid) return new Response(null, { status: 401, headers: noStore });
  const { mediaAssetId, variant } = await context.params;
  if (
    !uuidSchema.safeParse(mediaAssetId).success ||
    !['master', 'display', 'thumbnail'].includes(variant)
  )
    return new Response(null, { status: 404, headers: noStore });
  const services = firebaseAdminServices();
  try {
    const bytes = await new NativeMedia(
      services.db,
      services.storage,
      services.bucket.name,
    ).read(uid, mediaAssetId, variant as 'master' | 'display' | 'thumbnail');
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { ...noStore, 'Content-Type': 'image/webp' },
    });
  } catch (error) {
    logEvent(
      'WARNING',
      {
        event: 'media.read_failed',
        route: 'media.read',
        requestId: requestIdFrom(request.headers.get('x-request-id')),
        status: error instanceof NativeMediaError ? 404 : 500,
      },
      error,
    );
    if (error instanceof NativeMediaError)
      return new Response(null, { status: 404, headers: noStore });
    throw error;
  }
}
