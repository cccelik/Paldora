/**
 * The toast stack as a pure reducer, so timing and stacking are testable
 * without a browser. Time is always passed in; nothing here reads a clock.
 */

export type ToastTone = 'info' | 'success' | 'attention' | 'failure';

export interface ToastLink {
  readonly href: string;
  readonly label: string;
}

export interface ToastInput {
  readonly message: string;
  readonly tone?: ToastTone;
  readonly link?: ToastLink;
}

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
  readonly link?: ToastLink;
  /** When it disappears, unless the stack is paused. */
  readonly expiresAt: number;
}

export interface ToastState {
  readonly toasts: readonly Toast[];
  readonly nextId: number;
  /** Set while the pointer or focus is inside the stack. */
  readonly pausedAt: number | null;
}

export type ToastAction =
  | { readonly type: 'show'; readonly toast: ToastInput; readonly now: number }
  | { readonly type: 'dismiss'; readonly id: number }
  | { readonly type: 'expire'; readonly now: number }
  | { readonly type: 'pause'; readonly now: number }
  | { readonly type: 'resume'; readonly now: number };

export const TOAST_LIMIT = 3;
export const TOAST_DURATION_MS = 5_000;
export const ERROR_TOAST_DURATION_MS = 8_000;

export const initialToastState: ToastState = {
  toasts: [],
  nextId: 1,
  pausedAt: null,
};

/** Errors get `role="alert"` and stay longer. */
export function isErrorTone(tone: ToastTone): boolean {
  return tone === 'attention' || tone === 'failure';
}

export function toastDuration(tone: ToastTone): number {
  return isErrorTone(tone) ? ERROR_TOAST_DURATION_MS : TOAST_DURATION_MS;
}

function show(state: ToastState, input: ToastInput, now: number): ToastState {
  const tone = input.tone ?? 'info';
  // Shown while paused, a toast's clock starts when the pause ends.
  const start = state.pausedAt ?? now;
  const toast: Toast = {
    id: state.nextId,
    message: input.message,
    tone,
    ...(input.link ? { link: input.link } : {}),
    expiresAt: start + toastDuration(tone),
  };
  return {
    ...state,
    nextId: state.nextId + 1,
    // The oldest gives way, so the stack never grows past the limit.
    toasts: [...state.toasts, toast].slice(-TOAST_LIMIT),
  };
}

export function toastReducer(
  state: ToastState,
  action: ToastAction,
): ToastState {
  switch (action.type) {
    case 'show':
      return show(state, action.toast, action.now);
    case 'dismiss':
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.id),
      };
    case 'expire': {
      if (state.pausedAt !== null) return state;
      const toasts = state.toasts.filter(
        (toast) => toast.expiresAt > action.now,
      );
      return toasts.length === state.toasts.length
        ? state
        : { ...state, toasts };
    }
    case 'pause':
      return state.pausedAt === null
        ? { ...state, pausedAt: action.now }
        : state;
    case 'resume': {
      if (state.pausedAt === null) return state;
      const paused = Math.max(0, action.now - state.pausedAt);
      return {
        ...state,
        pausedAt: null,
        toasts: state.toasts.map((toast) => ({
          ...toast,
          expiresAt: toast.expiresAt + paused,
        })),
      };
    }
  }
}

/** Milliseconds until the next toast expires, or null when none is due. */
export function nextExpiryDelay(state: ToastState, now: number): number | null {
  if (state.pausedAt !== null || state.toasts.length === 0) return null;
  const soonest = Math.min(...state.toasts.map((toast) => toast.expiresAt));
  return Math.max(0, soonest - now);
}
