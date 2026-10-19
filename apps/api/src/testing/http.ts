import { errorEnvelopeSchema } from '@paldora/validation';
import { expect } from 'vitest';
import type { TestApp, TestUser } from './test-app.js';

/** Small helpers so integration tests read as the requests they make. */
export function client(app: TestApp, user: TestUser) {
  const call = (method: string, path: string, body?: unknown) =>
    app.request(user, path, {
      method,
      ...(body !== undefined ? { body } : {}),
    });
  return {
    get: (path: string) => call('GET', path),
    post: (path: string, body?: unknown) => call('POST', path, body),
    put: (path: string, body?: unknown) => call('PUT', path, body),
    patch: (path: string, body?: unknown) => call('PATCH', path, body),
    delete: (path: string) => call('DELETE', path),
  };
}

export async function errorOf(response: Response) {
  const body = errorEnvelopeSchema.parse(await response.json());
  return {
    status: response.status,
    code: body.error.code,
    message: body.error.message,
  };
}

/** Asserts status and (for failures) the stable error code. */
export async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<{ message: string }> {
  const error = await errorOf(response);
  expect({ status: error.status, code: error.code }).toEqual({ status, code });
  return { message: error.message };
}

export async function json<T = unknown>(
  response: Response,
  status = 200,
): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(status);
  return (await response.json()) as T;
}

export async function ok(response: Response, status = 204): Promise<void> {
  expect(response.status, await response.clone().text()).toBe(status);
}
