import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_WINDOW_MS, idleTapGuard, settle, tap } from './tap-guard';
describe('tap guard', () => {
  it('ignores a second press while the first is in flight', () => {
    const first = tap(idleTapGuard, 0);
    expect(first.accepted).toBe(true);
    expect(tap(first.state, 2_000).accepted).toBe(false);
  });

  it('ignores a fast second press even after the request finished', () => {
    const first = tap(idleTapGuard, 0);
    const done = settle(first.state);
    expect(tap(done, 150).accepted).toBe(false);
    expect(tap(done, DOUBLE_TAP_WINDOW_MS - 1).accepted).toBe(false);
  });

  it('accepts a deliberate later press', () => {
    const done = settle(tap(idleTapGuard, 0).state);
    const later = tap(done, DOUBLE_TAP_WINDOW_MS);
    expect(later.accepted).toBe(true);
    expect(later.state).toEqual({
      pending: true,
      lastAcceptedAt: DOUBLE_TAP_WINDOW_MS,
    });
  });

  it('keeps the state unchanged when a press is ignored', () => {
    const first = tap(idleTapGuard, 0);
    expect(tap(first.state, 10).state).toBe(first.state);
  });
});
