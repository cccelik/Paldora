import {
  apiRoutes,
  errorEnvelopeSchema,
  type CreateMediaUploadInput,
  type Preferences,
  type RouteDefinition,
  type RouteResponse,
} from '@paldora/validation';
import type { z } from 'zod';

/**
 * A failed API call. `code` is the stable public error code; branch on it,
 * never on `message`, which is human copy and may change.
 */
export class ApiClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface PaldoraApiClientOptions {
  /** Absolute base URL ending in `/api/v1`. */
  baseUrl: string;
  /** Returns a current access token, or null for anonymous calls. */
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

/** The profile fields a client may send; see `updateProfileSchema`. */
export type ProfileChanges = z.input<typeof apiRoutes.updateProfile.body>;

interface CallOptions {
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string | number | undefined>>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildPath(
  route: RouteDefinition,
  params: CallOptions['params'] = {},
): string {
  return route.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(
        `Missing path parameter ${name} for ${route.operationId}.`,
      );
    }
    return encodeURIComponent(value);
  });
}

function buildQuery(query: CallOptions['query'] = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

async function toError(response: Response): Promise<ApiClientError> {
  const fallback = new ApiClientError(
    response.status,
    response.status >= 500 ? 'INTERNAL_ERROR' : 'UNEXPECTED_RESPONSE',
    'Something went wrong. Try again.',
    response.headers.get('x-request-id'),
  );
  const parsed = errorEnvelopeSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) return fallback;
  const { code, message, requestId } = parsed.data.error;
  return new ApiClientError(response.status, code, message, requestId);
}

export class PaldoraApiClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  public constructor(private readonly options: PaldoraApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImplementation =
      options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public liveness(signal?: AbortSignal) {
    return this.call(apiRoutes.getLiveness, signal ? { signal } : {});
  }

  public readiness(signal?: AbortSignal) {
    return this.call(apiRoutes.getReadiness, signal ? { signal } : {});
  }

  public currentUser() {
    return this.call(apiRoutes.getCurrentUser);
  }

  /** Accepts the wire input; the server validates and normalizes it. */
  public updateProfile(body: ProfileChanges) {
    return this.call(apiRoutes.updateProfile, { body });
  }

  public usernameAvailability(username: string) {
    return this.call(apiRoutes.getUsernameAvailability, {
      query: { username },
    });
  }

  public updatePreferences(body: Preferences) {
    return this.call(apiRoutes.updatePreferences, { body });
  }

  public deleteAvatar() {
    return this.call(apiRoutes.deleteAvatar);
  }

  public createMediaUpload(body: CreateMediaUploadInput) {
    return this.call(apiRoutes.createMediaUpload, { body });
  }

  public completeMediaUpload(mediaAssetId: string) {
    return this.call(apiRoutes.completeMediaUpload, {
      params: { mediaAssetId },
    });
  }

  public mediaAsset(mediaAssetId: string) {
    return this.call(apiRoutes.getMediaAsset, { params: { mediaAssetId } });
  }

  /**
   * Performs one registered operation and validates the response against the
   * contract, so a server/client mismatch fails loudly instead of rendering
   * malformed data.
   */
  public async call<Route extends RouteDefinition>(
    route: Route,
    options: CallOptions = {},
  ): Promise<RouteResponse<Route>> {
    const headers = new Headers({ accept: 'application/json' });
    if (route.access === 'authenticated') {
      const token = await this.options.getAccessToken?.();
      if (!token) {
        throw new ApiClientError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Sign in to continue.',
          null,
        );
      }
      headers.set('authorization', `Bearer ${token}`);
    }
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    const response = await this.fetchImplementation(
      `${this.baseUrl}${buildPath(route, options.params)}${buildQuery(options.query)}`,
      {
        method: route.method,
        headers,
        cache: 'no-store',
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (!response.ok) throw await toError(response);
    if (route.successStatus === 204) return undefined as RouteResponse<Route>;
    const schema: z.ZodType = route.response;
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiClientError(
        response.status,
        'UNEXPECTED_RESPONSE',
        'The server returned an unexpected response.',
        response.headers.get('x-request-id'),
      );
    }
    return parsed.data as RouteResponse<Route>;
  }
}
