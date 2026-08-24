'use server';

import { ApiClientError, PaldoraApiClient } from '@paldora/api-client';
import { redirect } from 'next/navigation';
import { configuredWebOrigin } from '../lib/public-url';
import { createSupabaseServerClient } from '../lib/supabase/server';

export interface AuthActionState {
  status: 'idle' | 'error' | 'success';
  message?: string;
}

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password)
    return { status: 'error', message: 'Enter your email and password.' };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error)
    return {
      status: 'error',
      message: 'Those credentials did not match a provisioned account.',
    };
  try {
    await new PaldoraApiClient({
      baseUrl:
        process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
      getAccessToken: () => Promise.resolve(data.session.access_token),
    }).currentUser();
  } catch (provisioningError) {
    if (
      provisioningError instanceof ApiClientError &&
      provisioningError.code === 'ACCOUNT_NOT_PROVISIONED'
    ) {
      await supabase.auth.signOut();
      return {
        status: 'error',
        message: 'This account has not been provisioned for Paldora.',
      };
    }
    return {
      status: 'error',
      message: 'Paldora is temporarily unavailable. Try again shortly.',
    };
  }
  redirect('/home');
}

export async function forgotPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { status: 'error', message: 'Enter the account email.' };
  let origin: string;
  try {
    origin = configuredWebOrigin();
  } catch {
    return {
      status: 'error',
      message: 'Password reset is temporarily unavailable.',
    };
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  return {
    status: 'success',
    message: 'If that account exists, reset instructions are on their way.',
  };
}

export async function resetPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');
  if (password.length < 8)
    return {
      status: 'error',
      message: 'Use a password with at least 8 characters.',
    };
  if (password !== confirmation)
    return { status: 'error', message: 'The passwords do not match.' };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();
  if (sessionError || !user) {
    return {
      status: 'error',
      message:
        'This reset session is invalid or has expired. Request a new link.',
    };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return {
      status: 'error',
      message: resetPasswordErrorMessage(error.message),
    };
  return { status: 'success', message: 'Password updated. You can continue.' };
}

function resetPasswordErrorMessage(message: string): string {
  if (/same password|different from the old password/i.test(message)) {
    return 'Choose a password different from your current password.';
  }
  if (
    /password|weak|characters|uppercase|lowercase|digit|symbol/i.test(message)
  ) {
    return 'That password does not meet the account security requirements. Try a longer password with a mix of characters.';
  }
  if (/session|expired|jwt|token/i.test(message)) {
    return 'This reset session is invalid or has expired. Request a new link.';
  }
  return 'The password could not be updated. Try again or request a new reset link.';
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
