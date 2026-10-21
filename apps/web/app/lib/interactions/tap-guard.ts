/**
 * The guard on reaction buttons. A fast double tap must not toggle a
 * reaction on and then straight off again, so a press is ignored while a
 * request is in flight (single flight) and within a short window after the
 * last accepted press. A deliberate later press goes through.
 */
export const DOUBLE_TAP_WINDOW_MS = 600;

export interface TapGuardState {
  readonly pending: boolean;
  readonly lastAcceptedAt: number | null;
}

export const idleTapGuard: TapGuardState = {
  pending: false,
  lastAcceptedAt: null,
};

export function acceptsTap(
  state: TapGuardState,
  now: number,
  windowMs: number = DOUBLE_TAP_WINDOW_MS,
): boolean {
  if (state.pending) return false;
  return (
    state.lastAcceptedAt === null || now - state.lastAcceptedAt >= windowMs
  );
}

/** Records a press; returns the next state and whether it was accepted. */
export function tap(
  state: TapGuardState,
  now: number,
  windowMs: number = DOUBLE_TAP_WINDOW_MS,
): { readonly state: TapGuardState; readonly accepted: boolean } {
  if (!acceptsTap(state, now, windowMs)) return { state, accepted: false };
  return { state: { pending: true, lastAcceptedAt: now }, accepted: true };
}

/** The request finished, successfully or not. */
export function settle(state: TapGuardState): TapGuardState {
  return { ...state, pending: false };
}
