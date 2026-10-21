'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
} from '../actions/auth';
import { idleResult } from '../lib/action-result';
import { ActionFeedback as Feedback } from './action-feedback';
import styles from './form-stack.module.css';
import { SubmitButton } from './submit-button';
import { TextField } from './ui';
export function SignInForm() {
  const [state, action] = useActionState(signInAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <TextField
        label="Email"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <TextField
        label="Password"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Feedback state={state} />
      <SubmitButton pendingLabel="Signing in…" block>
        Sign in
      </SubmitButton>
      <Link className={styles.link} href="/forgot-password">
        Forgot your password?
      </Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <TextField
        label="Email"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Feedback state={state} />
      <SubmitButton pendingLabel="Sending…" block>
        Send reset link
      </SubmitButton>
      <Link className={styles.link} href="/sign-in">
        Back to sign in
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, idleResult);
  return (
    <form action={action} className={styles.form}>
      <TextField
        label="New password"
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        help="At least 10 characters."
        required
      />
      <TextField
        label="Confirm new password"
        id="confirmation"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
      />
      <Feedback state={state} />
      <SubmitButton pendingLabel="Saving…" block>
        Save password
      </SubmitButton>
      {state.status === 'success' ? (
        <Link className={styles.link} href="/home">
          Continue to Paldora
        </Link>
      ) : null}
    </form>
  );
}
