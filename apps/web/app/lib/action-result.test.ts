import { ApiClientError } from '@paldora/api-client';
import { describe, expect, it } from 'vitest';
import { actionError } from './action-result';

describe('actionError', () => {
  it('uses product copy for known codes', () => {
    const error = new ApiClientError(
      409,
      'USERNAME_UNAVAILABLE',
      'Taken.',
      'r',
    );
    expect(
      actionError(error, { USERNAME_UNAVAILABLE: 'That username is taken.' }),
    ).toEqual({
      status: 'error',
      code: 'USERNAME_UNAVAILABLE',
      message: 'That username is taken.',
      tone: 'attention',
    });
  });

  it('falls back to the API message for other client errors', () => {
    const error = new ApiClientError(
      400,
      'VALIDATION_FAILED',
      'name: Too long.',
      'r',
    );
    expect(actionError(error).message).toBe('name: Too long.');
  });

  it('never exposes server or unknown error details', () => {
    expect(
      actionError(new ApiClientError(500, 'INTERNAL_ERROR', 'stack…', 'r')),
    ).toMatchObject({
      message: 'Something went wrong. Try again.',
      tone: 'failure',
    });
    expect(actionError(new Error('db password hunter2')).message).toBe(
      'Something went wrong. Try again.',
    );
  });
});
