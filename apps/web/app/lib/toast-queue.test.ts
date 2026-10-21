import { describe, expect, it } from 'vitest';
import {
  ERROR_TOAST_DURATION_MS,
  initialToastState,
  isErrorTone,
  nextExpiryDelay,
  TOAST_DURATION_MS,
  TOAST_LIMIT,
  toastReducer,
  type ToastAction,
  type ToastState,
} from './toast-queue';
const run = (actions: readonly ToastAction[], state = initialToastState) =>
  actions.reduce<ToastState>(toastReducer, state);

describe('toastReducer', () => {
  it('expires ordinary toasts at 5 seconds and errors at 8', () => {
    const state = run([
      { type: 'show', toast: { message: 'Saved.' }, now: 0 },
      {
        type: 'show',
        toast: { message: 'Failed.', tone: 'failure' },
        now: 0,
      },
    ]);
    expect(state.toasts.map((toast) => toast.expiresAt)).toEqual([
      TOAST_DURATION_MS,
      ERROR_TOAST_DURATION_MS,
    ]);
    expect(nextExpiryDelay(state, 1_000)).toBe(4_000);
    const later = toastReducer(state, { type: 'expire', now: 5_000 });
    expect(later.toasts.map((toast) => toast.message)).toEqual(['Failed.']);
    expect(
      toastReducer(later, { type: 'expire', now: 8_000 }).toasts,
    ).toHaveLength(0);
  });

  it('keeps at most three, dropping the oldest', () => {
    const state = run(
      ['a', 'b', 'c', 'd'].map((message, index) => ({
        type: 'show' as const,
        toast: { message },
        now: index,
      })),
    );
    expect(state.toasts).toHaveLength(TOAST_LIMIT);
    expect(state.toasts.map((toast) => toast.message)).toEqual(['b', 'c', 'd']);
    expect(new Set(state.toasts.map((toast) => toast.id)).size).toBe(3);
  });

  it('pauses while hovered or focused and resumes with the time that was left', () => {
    const state = run([
      { type: 'show', toast: { message: 'Hi' }, now: 0 },
      { type: 'pause', now: 4_000 },
      { type: 'expire', now: 20_000 },
    ]);
    expect(state.toasts).toHaveLength(1);
    expect(nextExpiryDelay(state, 20_000)).toBeNull();
    const resumed = toastReducer(state, { type: 'resume', now: 20_000 });
    expect(nextExpiryDelay(resumed, 20_000)).toBe(1_000);
    expect(
      toastReducer(resumed, { type: 'expire', now: 20_999 }).toasts,
    ).toHaveLength(1);
    expect(
      toastReducer(resumed, { type: 'expire', now: 21_000 }).toasts,
    ).toHaveLength(0);
  });

  it('starts the clock of a toast shown during a pause when the pause ends', () => {
    const state = run([
      { type: 'pause', now: 0 },
      { type: 'show', toast: { message: 'Late' }, now: 3_000 },
      { type: 'resume', now: 10_000 },
    ]);
    expect(nextExpiryDelay(state, 10_000)).toBe(TOAST_DURATION_MS);
  });

  it('dismisses one toast by id and keeps links', () => {
    const state = run([
      {
        type: 'show',
        toast: {
          message: 'You have a new notification.',
          link: { href: '/notifications', label: 'View' },
        },
        now: 0,
      },
      { type: 'show', toast: { message: 'Other' }, now: 0 },
    ]);
    expect(state.toasts[0]?.link).toEqual({
      href: '/notifications',
      label: 'View',
    });
    const first = state.toasts[0]?.id ?? 0;
    expect(
      toastReducer(state, { type: 'dismiss', id: first }).toasts.map(
        (toast) => toast.message,
      ),
    ).toEqual(['Other']);
  });

  it('treats attention and failure as errors', () => {
    expect(isErrorTone('failure')).toBe(true);
    expect(isErrorTone('attention')).toBe(true);
    expect(isErrorTone('success')).toBe(false);
    expect(isErrorTone('info')).toBe(false);
  });
});
