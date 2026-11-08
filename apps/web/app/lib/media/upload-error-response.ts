import { type NativeMediaError } from '@paldora/firebase-trusted';

const noStore = { 'Cache-Control': 'private, no-store' };

/** Identical 404 for unavailable assets; 400 plus a non-sensitive reason code otherwise. */
export function uploadErrorResponse(error: NativeMediaError): Response {
  if (error.code === 'UNAVAILABLE')
    return new Response(null, { status: 404, headers: noStore });
  if (error.reason)
    return Response.json(
      { code: error.reason },
      { status: 400, headers: noStore },
    );
  return new Response(null, { status: 400, headers: noStore });
}
