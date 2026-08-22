import type { ApiErrorShape, HealthStatus } from '@paldora/domain';

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
}

export class PaldoraApiClient {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;

  public constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.request = options.fetchImplementation ?? fetch;
  }

  public async health(signal?: AbortSignal): Promise<HealthStatus> {
    const requestInit: RequestInit = {
      headers: { accept: 'application/json' },
      ...(signal ? { signal } : {}),
    };
    const response = await this.request(`${this.baseUrl}/health`, requestInit);
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
    return (await response.json()) as HealthStatus;
  }
}
