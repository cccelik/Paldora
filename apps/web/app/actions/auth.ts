'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    return {
      status: 'error',
      message: 'Those credentials did not match a provisioned account.',
    };
  redirect('/home');
}

export async function forgotPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { status: 'error', message: 'Enter the account email.' };
  const requestHeaders = await headers();
  const origin =
    process.env.NEXT_PUBLIC_WEB_URL ??
    `${requestHeaders.get('x-forwarded-proto') ?? 'http'}://${requestHeaders.get('host') ?? 'localhost:3000'}`;
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
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return {
      status: 'error',
      message: 'This reset link is invalid or has expired.',
    };
  return { status: 'success', message: 'Password updated. You can continue.' };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
