import { firebaseLocalWebUrl } from '@/lib/server/firebase/mode';
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
import { boundedBody } from '@/lib/media/bounded-body';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'private, no-store' };
const maxBytes = 10 * 1024 * 1024;

/** Authenticated same-origin upload; the browser never receives Storage credentials. */
export async function PUT(
  request: Request,
  context: { params: Promise<{ mediaAssetId: string }> },
) {
  if (request.headers.get('origin') !== new URL(firebaseLocalWebUrl()).origin)
    return new Response(null, { status: 403, headers: noStore });
  const uid = await firebaseSessionUid();
  if (!uid) return new Response(null, { status: 401, headers: noStore });
  const { mediaAssetId } = await context.params;
  if (!uuidSchema.safeParse(mediaAssetId).success)
    return new Response(null, { status: 404, headers: noStore });
  const length = Number(request.headers.get('content-length'));
  if (!Number.isInteger(length) || length < 1 || length > maxBytes)
    return new Response(null, { status: 413, headers: noStore });
  const bytes = await boundedBody(request, length, maxBytes);
  if (!bytes) return new Response(null, { status: 400, headers: noStore });
  const services = firebaseAdminServices();
  try {
    await new NativeMedia(
      services.db,
      services.storage,
      services.bucket.name,
    ).upload(
      uid,
      mediaAssetId,
      bytes,
      request.headers.get('content-type') ?? '',
    );
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    logEvent(
      'WARNING',
      {
        event: 'media.upload_failed',
        route: 'media.upload',
        requestId: requestIdFrom(request.headers.get('x-request-id')),
      },
      error,
    );
    if (error instanceof NativeMediaError)
      return new Response(null, {
        status: error.code === 'UNAVAILABLE' ? 404 : 400,
        headers: noStore,
      });
    throw error;
  }
}
