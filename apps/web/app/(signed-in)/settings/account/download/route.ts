import { firebaseWebData } from '@/lib/server/firebase/data';
import {
  FIREBASE_SESSION_COOKIE,
  firebaseAdminServices,
} from '@/lib/server/firebase/session';
import { cookies } from 'next/headers';
import { Readable } from 'node:stream';

/** Stream private export bytes only after fresh owner and session checks. */
export async function GET() {
  try {
    {
      const cookie = (await cookies()).get(FIREBASE_SESSION_COOKIE)?.value;
      const uid = cookie
        ? await firebaseAdminServices()
            .sessions.verify(cookie)
            .catch(() => null)
        : null;
      if (!uid)
        return new Response('Archive is unavailable.', {
          status: 404,
          headers: { 'Cache-Control': 'private, no-store' },
        });
      const data = await firebaseWebData();
      const { export: archive } = await data.accountExport();
      if (!archive || archive.status !== 'ready')
        return new Response('Archive is not ready.', {
          status: 404,
          headers: { 'Cache-Control': 'private, no-store' },
        });
      const stream = await data.downloadAccountExport(archive.id);
      // Verify revocation again immediately before starting the Storage stream.
      if (
        !cookie ||
        (await firebaseAdminServices()
          .sessions.verify(cookie)
          .catch(() => null)) !== uid
      ) {
        stream.destroy();
        return new Response('Archive is unavailable.', {
          status: 404,
          headers: { 'Cache-Control': 'private, no-store' },
        });
      }
      return new Response(
        Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': 'attachment; filename="paldora-data.json"',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    }
  } catch {
    return new Response('Archive is unavailable.', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
