import { pipeline } from 'node:stream/promises';
import type { Writable } from 'node:stream';
import {
  logEvent,
  NativeLifecycleError,
  NativeRateLimitError,
  requestIdFrom,
  type NativeAccountLifecycle,
  type NativeCallableSessions,
  type NativeRateLimits,
} from '@paldora/firebase-trusted';
import { native } from '@paldora/validation';
import {
  authenticate,
  fail,
  headerValue,
  segments,
  Unauthenticated,
  uuidPattern,
  WINDOW_MS,
  type MediaHttpRequest,
  type MediaHttpResponse,
} from './media-http.js';

/**
 * `GET /{exportId}`: streams the caller's ready `paldora-json-v1` archive (ADR
 * 021 slice: account safety). It applies the same rules as the web
 * `settings/account/download` route: the id must be the caller's latest export,
 * `ready` and unexpired, and the session is verified again immediately before
 * the Storage stream starts. Unknown, foreign, older, pending, expired and
 * inaccessible exports are the same 404. No Firebase download URL or Storage
 * path ever leaves the server.
 */
export type ExportHttpResponse = MediaHttpResponse &
  Writable & { headersSent: boolean };

export interface ExportHttpDeps {
  verifyIdToken(
    token: string,
    checkRevoked: boolean,
  ): Promise<{ uid: string; paldoraSessionEpoch?: unknown }>;
  sessions: Pick<NativeCallableSessions, 'require'>;
  rateLimits: Pick<NativeRateLimits, 'consume'>;
  lifecycle: Pick<NativeAccountLifecycle, 'latestExport' | 'downloadStream'>;
}

const found = native.nativeHttpEndpoints.find(
  (item) => item.name === 'accountExportDownload',
);
if (!found)
  throw new Error('accountExportDownload is not in the native HTTP registry');
const spec = found;

function statusOf(error: unknown): number {
  if (error instanceof Unauthenticated) return 401;
  if (error instanceof NativeRateLimitError) return 429;
  if (error instanceof NativeLifecycleError) return 404;
  return 503;
}

class NotFound extends Error {}

export async function handleAccountExportDownload(
  request: MediaHttpRequest,
  res: ExportHttpResponse,
  dependencies: ExportHttpDeps,
): Promise<void> {
  if (request.method !== 'GET') {
    fail(res, 405, 'GET');
    return;
  }
  try {
    const uid = await authenticate(request, dependencies);
    await dependencies.rateLimits.consume(
      uid,
      spec.limit.scope,
      spec.limit.perHour,
      WINDOW_MS,
    );
    const id = segments(request).at(-1);
    if (!id || !uuidPattern.test(id)) throw new NotFound();
    const { export: latest } = await dependencies.lifecycle.latestExport(uid);
    if (!latest || latest.id !== id.toLowerCase() || latest.status !== 'ready')
      throw new NotFound();
    const stream = await dependencies.lifecycle.downloadStream(uid, latest.id);
    try {
      // Revocation can land during the slow Storage open; check once more.
      if ((await authenticate(request, dependencies)) !== uid)
        throw new Unauthenticated();
    } catch (error) {
      stream.destroy();
      throw error;
    }
    res
      .status(200)
      .set('Cache-Control', 'private, no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Type', 'application/json; charset=utf-8')
      .set('Content-Disposition', 'attachment; filename="paldora-data.json"');
    await pipeline(stream, res);
  } catch (error) {
    const status = error instanceof NotFound ? 404 : statusOf(error);
    if (status >= 500)
      logEvent(
        'ERROR',
        {
          event: 'account.export_download_failed',
          route: 'account.export_download',
          requestId: requestIdFrom(headerValue(request, 'x-request-id')),
          status,
        },
        error,
      );
    if (res.headersSent) {
      res.destroy();
      return;
    }
    fail(res, status);
  }
}
