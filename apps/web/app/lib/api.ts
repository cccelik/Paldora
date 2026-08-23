import 'server-only';

import { PaldoraApiClient } from '@paldora/api-client';
import type { CurrentUser, OnboardingState } from '@paldora/domain';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase/server';

export async function authenticatedApiClient(): Promise<PaldoraApiClient> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in');
  return new PaldoraApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
    getAccessToken: () => Promise.resolve(session.access_token),
  });
}

export async function loadCurrentUser() {
  return (await authenticatedApiClient()).currentUser();
}

const onboardingRoutes: Record<Exclude<OnboardingState, 'complete'>, Route> = {
  username: '/onboarding/username',
  profile: '/onboarding/profile',
  avatar: '/onboarding/avatar',
};

export async function loadCompletedCurrentUser(): Promise<CurrentUser> {
  const current = await loadCurrentUser();
  if (current.profile.onboardingState !== 'complete') {
    redirect(onboardingRoutes[current.profile.onboardingState]);
  }
  return current;
}
