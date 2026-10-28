import {
  logEvent,
  NativeCallableSessionError,
  NativeMediaError,
  NativeRateLimitError,
  requestIdFrom,
  type NativeCallableSessions,
  type NativeMedia,
  type NativeRateLimits,
} from '@paldora/firebase-trusted';
import { native } from '@paldora/validation';

/**
 * Authenticated HTTP bytes for private media (ADR 021 decision 8). Native
 * clients reserve and complete uploads with callables, then PUT and GET the
 * bytes here with `Authorization: Bearer <Firebase ID token>`. Authorization is
 * the web `/media` routes' (`NativeMedia`), re-run on every request, so there
 * is no signed URL, Storage path or download URL anywhere. Absence and denial
 * are the same 404.
 */

export interface MediaHttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer | undefined;
  body?: unknown;
}

export interface MediaHttpResponse {
  status(code: number): MediaHttpResponse;
  set(name: string, value: string): MediaHttpResponse;
  send(body?: Buffer | string): unknown;
}

export interface MediaHttpDeps {
  verifyIdToken(
    token: string,
    checkRevoked: boolean,
  ): Promise<{ uid: string; paldoraSessionEpoch?: unknown }>;
  sessions: Pick<NativeCallableSessions, 'require'>;
  rateLimits: Pick<NativeRateLimits, 'consume'>;
  media: Pick<NativeMedia, 'upload' | 'read'>;
}

export const WINDOW_MS = 60 * 60 * 1_000;
const endpoint = (name: string) => {
  const found = native.nativeHttpEndpoints.find((item) => item.name === name);
  if (!found) throw new Error(`${name} is not in the native HTTP registry`);
  return found;
};
const uploadSpec = endpoint('mediaUpload');
const readSpec = endpoint('mediaRead');
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const errorCodes: Record<number, string> = {
  400: 'invalid-argument',
  401: 'unauthenticated',
  404: 'not-found',
  405: 'invalid-argument',
  413: 'invalid-argument',
  429: 'resource-exhausted',
  500: 'internal',
  503: 'unavailable',
};

export function fail(
  res: MediaHttpResponse,
  status: number,
  allow?: string,
): MediaHttpResponse {
  res
    .status(status)
    .set('Cache-Control', 'private, no-store')
    .set('X-Content-Type-Options', 'nosniff')
    .set('Content-Type', 'application/json; charset=utf-8');
  if (allow) res.set('Allow', allow);
  res.send(
    JSON.stringify({ error: { code: errorCodes[status] ?? 'internal' } }),
  );
  return res;
}

export function headerValue(
  request: MediaHttpRequest,
  name: string,
): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export class Unauthenticated extends Error {}

/** Same gate as a callable: valid, unrevoked ID token, then the session-epoch check. */
export async function authenticate(
  request: MediaHttpRequest,
  deps: Pick<MediaHttpDeps, 'verifyIdToken' | 'sessions'>,
): Promise<string> {
  const match = /^Bearer (\S+)$/iu.exec(
    headerValue(request, 'authorization') ?? '',
  );
  if (!match?.[1]) throw new Unauthenticated();
  let decoded;
  try {
    // checkRevoked: a disabled or revoked user is refused at once, not at expiry.
    decoded = await deps.verifyIdToken(match[1], true);
  } catch {
    throw new Unauthenticated();
  }
  try {
    await deps.sessions.require(decoded.uid, decoded.paldoraSessionEpoch);
  } catch (error) {
    if (error instanceof NativeCallableSessionError)
      throw new Unauthenticated();
    throw error;
  }
  return decoded.uid;
}

export function segments(request: MediaHttpRequest): string[] {
  return request.path.split('/').filter(Boolean);
}

function bodyOf(request: MediaHttpRequest): Buffer | null {
  if (Buffer.isBuffer(request.rawBody)) return request.rawBody;
  return Buffer.isBuffer(request.body) ? request.body : null;
}

/** Maps a failure to its status. Unknown errors are logged and fail closed. */
function statusOf(error: unknown, upload: boolean): number {
  if (error instanceof Unauthenticated) return 401;
  if (error instanceof NativeRateLimitError) return 429;
  if (error instanceof NativeMediaError) {
    if (error.code === 'UNAVAILABLE' || error.code === 'NOT_READY') return 404;
    if (error.code === 'STORAGE_UNAVAILABLE') return 503;
    return upload ? 400 : 404;
  }
  return 503;
}

async function run(
  request: MediaHttpRequest,
  res: MediaHttpResponse,
  route: 'media.http_upload' | 'media.http_read',
  dependencies: MediaHttpDeps,
  work: (uid: string) => Promise<void>,
): Promise<void> {
  const upload = route === 'media.http_upload';
  const spec = upload ? uploadSpec : readSpec;
  try {
    const uid = await authenticate(request, dependencies);
    await dependencies.rateLimits.consume(
      uid,
      spec.limit.scope,
      spec.limit.perHour,
      WINDOW_MS,
    );
    await work(uid);
  } catch (error) {
    const status = statusOf(error, upload);
    if (status >= 500 || status === 400)
      logEvent(
        status >= 500 ? 'ERROR' : 'WARNING',
        {
          event: `${route}_failed`,
          route,
          requestId: requestIdFrom(headerValue(request, 'x-request-id')),
          status,
        },
        error,
      );
    fail(res, status);
  }
}

/** `PUT /{assetId}`: raw bytes, exact Content-Type and length (ADR 021). */
export async function handleMediaUpload(
  request: MediaHttpRequest,
  res: MediaHttpResponse,
  dependencies: MediaHttpDeps,
): Promise<void> {
  if (request.method !== 'PUT') {
    fail(res, 405, 'PUT');
    return;
  }
  await run(request, res, 'media.http_upload', dependencies, async (uid) => {
    const parts = segments(request);
    const id = parts[parts.length - 1];
    if (!id || !uuidPattern.test(id)) throw new NativeMediaError('UNAVAILABLE');
    const bytes = bodyOf(request);
    const max = uploadSpec.maxBodyBytes ?? 0;
    if (bytes && bytes.length > max) {
      fail(res, 413);
      return;
    }
    if (!bytes || bytes.length === 0) throw new NativeMediaError('MISMATCH');
    await dependencies.media.upload(
      uid,
      id.toLowerCase(),
      bytes,
      headerValue(request, 'content-type') ?? '',
    );
    res
      .status(204)
      .set('Cache-Control', 'private, no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .send();
  });
}

/** `GET /{assetId}/{display|thumbnail}`: WebP bytes after live authorization. */
export async function handleMediaRead(
  request: MediaHttpRequest,
  res: MediaHttpResponse,
  dependencies: MediaHttpDeps,
): Promise<void> {
  if (request.method !== 'GET') {
    fail(res, 405, 'GET');
    return;
  }
  await run(request, res, 'media.http_read', dependencies, async (uid) => {
    const parts = segments(request);
    const id = parts[parts.length - 2];
    const variant = parts[parts.length - 1];
    if (
      !id ||
      !uuidPattern.test(id) ||
      !variant ||
      !(native.NATIVE_MEDIA_VARIANTS as readonly string[]).includes(variant)
    )
      throw new NativeMediaError('UNAVAILABLE');
    const bytes = await dependencies.media.read(
      uid,
      id.toLowerCase(),
      variant as (typeof native.NATIVE_MEDIA_VARIANTS)[number],
    );
    res
      .status(200)
      .set('Cache-Control', 'private, no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Type', 'image/webp')
      .send(bytes);
  });
}
