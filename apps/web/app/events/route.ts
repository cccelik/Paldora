import {
  firebaseAdminServices,
  FIREBASE_SESSION_COOKIE,
} from '@/lib/server/firebase/session';
import {
  logEvent,
  NativeNotifications,
  requestIdFrom,
} from '@paldora/firebase-trusted';
import 'server-only';

export const dynamic = 'force-dynamic';

/** Opaque, short-lived invalidation stream. Each poll rechecks the cookie and account. */
export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers.get('x-request-id'));
  const failed = (event: string) => (error: unknown) => {
    logEvent('WARNING', { event, route: 'events', requestId }, error);
    return null;
  };
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${FIREBASE_SESSION_COOKIE}=`))
    ?.slice(FIREBASE_SESSION_COOKIE.length + 1);
  if (!cookie) return new Response(null, { status: 401 });
  const services = firebaseAdminServices();
  const uid = await services.sessions
    .verify(cookie)
    .catch(failed('events.session_verify_failed'));
  if (!uid) return new Response(null, { status: 401 });
  const notifications = new NativeNotifications(services.db);
  const initial = await notifications
    .hintVersion(uid)
    .catch(failed('events.hint_failed'));
  if (initial === null) return new Response(null, { status: 401 });
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (hint: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(hint)}\n\n`));
      send({ type: 'resync' });
      void (async () => {
        let version = initial;
        const deadline = Date.now() + 45_000;
        try {
          while (!closed && !request.signal.aborted && Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop -- One stream polls sequentially.
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 5_000);
            });
            if (closed || request.signal.aborted) break;
            // eslint-disable-next-line no-await-in-loop -- Revocation is rechecked before every hint.
            const valid = await services.sessions
              .verify(cookie)
              .catch(failed('events.session_verify_failed'));
            if (valid !== uid) break;
            // eslint-disable-next-line no-await-in-loop -- Account status is rechecked before every hint.
            const next = await notifications
              .hintVersion(uid)
              .catch(failed('events.hint_failed'));
            if (closed || request.signal.aborted) break;
            if (next === null) break;
            if (next !== version) {
              version = next;
              send({ type: 'notifications.changed' });
            } else controller.enqueue(encoder.encode(': keepalive\n\n'));
          }
        } catch (error) {
          logEvent(
            'WARNING',
            { event: 'events.stream_failed', route: 'events', requestId },
            error,
          );
          // A disconnected reader can reject an enqueue after an async check.
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
