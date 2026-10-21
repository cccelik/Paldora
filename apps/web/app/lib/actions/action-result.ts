import { ApiClientError } from '@paldora/api-client';
/**
 * What a Server Action returns to `useActionState`. Results travel in React
 * state, never in URL query strings, so messages do not leak into history,
 * logs, or shared links.
 */
export type ActionResult<Data = undefined> =
  | { readonly status: 'idle' }
  | {
      readonly status: 'success';
      readonly message: string;
      readonly data: Data;
    }
  | {
      readonly status: 'error';
      readonly code: string;
      readonly message: string;
      /** `attention` for expected conflicts, `failure` for real errors. */
      readonly tone: 'attention' | 'failure';
    };

/** What an action returns once it has run: never `idle`. */
export type ActionOutcome<Data = undefined> = Exclude<
  ActionResult<Data>,
  { status: 'idle' }
>;

export const idleResult = { status: 'idle' } as const satisfies ActionResult;

const genericFailure = 'Something went wrong. Try again.';

/**
 * Converts any thrown value into a displayable error. Only API error codes in
 * `copy` get custom text; unknown errors never expose internal messages.
 */
export function actionError(
  error: unknown,
  copy: Readonly<Partial<Record<string, string>>> = {},
): Extract<ActionResult, { status: 'error' }> {
  if (!(error instanceof ApiClientError)) {
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: genericFailure,
      tone: 'failure',
    };
  }
  const message =
    copy[error.code] ?? (error.status < 500 ? error.message : genericFailure);
  return {
    status: 'error',
    code: error.code,
    message,
    tone: error.status < 500 ? 'attention' : 'failure',
  };
}

/** Expected validation failure without exposing parser internals. */
export const invalidOutcome = (message: string): ActionOutcome<never> => ({
  status: 'error',
  code: 'VALIDATION_FAILED',
  message,
  tone: 'attention',
});
