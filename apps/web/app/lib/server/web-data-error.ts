/** Stable error envelope for trusted web data calls. */
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type PageOptions = {
  cursor?: string | undefined;
  limit?: number | undefined;
};
