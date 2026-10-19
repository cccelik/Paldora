'use server';

import { ApiClientError } from '@paldora/api-client';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { actionError, type ActionResult } from '../lib/action-result';
import { APPEARANCE_COOKIE, appearanceCookieOptions } from '../lib/appearance';
import { publicEnvironment } from '../lib/environment';
import { textField } from '../lib/form-data';
import { routeForOnboarding } from '../lib/onboarding';
import { apiClientFor } from '../lib/session';
import { createSupabaseServerClient } from '../lib/supabase/server';

const failure = (message: string): ActionResult => ({
  status: 'error',
  code: 'VALIDATION_FAILED',
  message,
  tone: 'attention',
});

const secureCookies = () =>
  publicEnvironment().NEXT_PUBLIC_WEB_URL.startsWith('https://');

/**
 * Signs in with Supabase, then asks the API whether this identity is a
 * provisioned Paldora account. Identities without one are signed out again.
 * The same message covers wrong passwords and unknown emails.
 */
export async function signInAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = textField(formData, 'email').trim();
  const password = textField(formData, 'password');
  if (!email || !password) return failure('Enter your email and password.');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    return failure('That email and password don’t match an account.');
  }
  let destination;
  try {
    const user = await apiClientFor(data.session.access_token).currentUser();
    (await cookies()).set(
      APPEARANCE_COOKIE,
      user.preferences.appearance,
      appearanceCookieOptions(secureCookies()),
    );
    destination = routeForOnboarding(user.profile.onboardingState);
  } catch (apiError) {
    await supabase.auth.signOut();
    if (
      apiError instanceof ApiClientError &&
      (apiError.code === 'ACCOUNT_NOT_PROVISIONED' ||
        apiError.code === 'ACCOUNT_BLOCKED')
    ) {
      return failure('This account isn’t set up for Paldora.');
    }
    return actionError(apiError);
  }
  redirect(destination);
}

/** Always answers the same way, so it cannot reveal which emails exist. */
export async function forgotPasswordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = textField(formData, 'email').trim();
  if (!email) return failure('Enter the email for your account.');
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnvironment().NEXT_PUBLIC_WEB_URL}/auth/callback?next=/reset-password`,
  });
  return {
    status: 'success',
    message: 'If that account exists, a reset link is on its way.',
    data: undefined,
  };
}

const MIN_PASSWORD_LENGTH = 10;

function passwordProblem(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmation) return 'The passwords don’t match.';
  return null;
}

export async function resetPasswordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const password = textField(formData, 'password');
  const problem = passwordProblem(
    password,
    textField(formData, 'confirmation'),
  );
  if (problem) return failure(problem);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return failure('This reset link expired. Request a new one.');
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return failure(
      /same|different/i.test(error.message)
        ? 'Choose a password you haven’t used here before.'
        : 'That password couldn’t be saved. Try a longer one.',
    );
  }
  return { status: 'success', message: 'Password updated.', data: undefined };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(APPEARANCE_COOKIE);
  redirect('/sign-in');
}
