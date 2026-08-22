'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  type AuthActionState,
} from '../actions/auth';

const initialAuthState: AuthActionState = { status: 'idle' };

function Notice({ state }: { state: typeof initialAuthState }) {
  if (state.status === 'idle') return null;
  return (
    <p className={`form-notice ${state.status}`} role="status">
      {state.message}
    </p>
  );
}

export function SignInForm() {
  const [state, action, pending] = useActionState(
    signInAction,
    initialAuthState,
  );
  return (
    <form action={action} className="form-stack">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <Notice state={state} />
      <button className="button-primary" disabled={pending} type="submit">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <Link className="text-link" href="/forgot-password">
        Forgot password?
      </Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    forgotPasswordAction,
    initialAuthState,
  );
  return (
    <form action={action} className="form-stack">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <Notice state={state} />
      <button className="button-primary" disabled={pending} type="submit">
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      <Link className="text-link" href="/sign-in">
        Back to sign in
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(
    resetPasswordAction,
    initialAuthState,
  );
  return (
    <form action={action} className="form-stack">
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      <Notice state={state} />
      <button className="button-primary" disabled={pending} type="submit">
        {pending ? 'Updating…' : 'Reset password'}
      </button>
      {state.status === 'success' && (
        <Link className="text-link" href="/home">
          Continue to Paldora
        </Link>
      )}
    </form>
  );
}
