import type {
  ApiErrorShape,
  CreateAvatarUploadInput,
  CreateAvatarUploadResult,
  CurrentUser,
  HealthStatus,
  MediaAssetId,
  UpdateProfileInput,
  UsernameAvailability,
} from '@paldora/domain';

export class ApiClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}

export class PaldoraApiClient {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;

  public constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.request =
      options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.getAccessToken =
      options.getAccessToken ?? (() => Promise.resolve(null));
  }

  public async health(signal?: AbortSignal): Promise<HealthStatus> {
    return this.send<HealthStatus>('/health', { signal, authenticated: false });
  }

  public currentUser(signal?: AbortSignal): Promise<CurrentUser> {
    return this.send('/me', { signal });
  }

  public usernameAvailability(
    username: string,
    signal?: AbortSignal,
  ): Promise<UsernameAvailability> {
    return this.send('/me/username/availability', {
      method: 'POST',
      body: { username },
      signal,
    });
  }

  public updateProfile(
    input: UpdateProfileInput,
    signal?: AbortSignal,
  ): Promise<CurrentUser> {
    return this.send('/me/profile', {
      method: 'PATCH',
      body: input,
      signal,
    });
  }

  public createAvatarUpload(
    input: CreateAvatarUploadInput,
    signal?: AbortSignal,
  ): Promise<CreateAvatarUploadResult> {
    return this.send('/me/avatar/uploads', {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public completeAvatarUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<CurrentUser> {
    return this.send(`/me/avatar/uploads/${id}/complete`, {
      method: 'POST',
      signal,
    });
  }

  public deleteAvatar(signal?: AbortSignal): Promise<CurrentUser> {
    return this.send('/me/avatar', { method: 'DELETE', signal });
  }

  private async send<Result>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      body?: unknown;
      signal?: AbortSignal | undefined;
      authenticated?: boolean;
    } = {},
  ): Promise<Result> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    if (options.authenticated !== false) {
      const token = await this.getAccessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };
    const response = await this.request(`${this.baseUrl}${path}`, requestInit);
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => null)) as ApiErrorShape | null;
      throw new ApiClientError(
        response.status,
        body?.error.code ?? 'UNEXPECTED_API_ERROR',
        body?.error.message ?? 'The Paldora API request failed.',
      );
    }
    return (await response.json()) as Result;
  }
}
