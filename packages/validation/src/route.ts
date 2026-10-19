import type { ApiErrorCode } from '@paldora/domain';
import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * One HTTP operation. The API, the typed client, and the generated OpenAPI
 * document all read this definition, so they cannot drift apart. Paths are
 * relative to `/api/v1` and use `{name}` parameters.
 */
export interface RouteDefinition<
  Response extends z.ZodType = z.ZodType,
  Body extends z.ZodType | undefined = z.ZodType | undefined,
  Query extends z.ZodType | undefined = z.ZodType | undefined,
> {
  readonly operationId: string;
  readonly method: HttpMethod;
  readonly path: `/${string}`;
  readonly summary: string;
  readonly tag: string;
  /** `public` routes are the only ones reachable without a bearer token. */
  readonly access: 'public' | 'authenticated';
  readonly successStatus: 200 | 201 | 204;
  readonly response: Response;
  readonly body?: Body;
  readonly query?: Query;
  /** Stable error codes callers must handle, beyond the global ones. */
  readonly errors: readonly ApiErrorCode[];
}

export function defineRoute<
  Response extends z.ZodType,
  Body extends z.ZodType | undefined = undefined,
  Query extends z.ZodType | undefined = undefined,
>(
  definition: RouteDefinition<Response, Body, Query>,
): RouteDefinition<Response, Body, Query> {
  return definition;
}

export type RouteResponse<Route extends RouteDefinition> = z.output<
  Route['response']
>;
