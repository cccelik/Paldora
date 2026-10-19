import 'server-only';

import { ApiClientError, PaldoraApiClient } from '@paldora/api-client';
import type { CurrentUser } from '@paldora/validation';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { publicEnvironment } from './environment';
import { routeForOnboarding } from './onboarding';
import { createSupabaseServerClient } from './supabase/server';

/**
 * The web data-access layer. The session cookie only supplies the bearer
 * token; the API verifies it and decides authorization on every call.
 */
export const accessToken = cache(async (): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

export function apiClientFor(token: string | null): PaldoraApiClient {
  return new PaldoraApiClient({
    baseUrl: publicEnvironment().NEXT_PUBLIC_API_URL,
    getAccessToken: async () => token,
  });
}

export async function apiClient(): Promise<PaldoraApiClient> {
  return apiClientFor(await accessToken());
}

const accountUnavailableCodes = new Set([
  'ACCOUNT_NOT_PROVISIONED',
  'ACCOUNT_BLOCKED',
]);

/** Redirects instead of rendering when the session cannot load an account. */
function redirectForAccountError(error: unknown): never {
  if (error instanceof ApiClientError) {
    if (error.code === 'AUTHENTICATION_REQUIRED') redirect('/sign-in');
    if (accountUnavailableCodes.has(error.code)) {
      redirect('/account-unavailable');
    }
  }
  throw error;
}

/** The signed-in user, once per render pass. */
export const currentUser = cache(async (): Promise<CurrentUser> => {
  const token = await accessToken();
  if (!token) redirect('/sign-in');
  try {
    return await apiClientFor(token).currentUser();
  } catch (error) {
    return redirectForAccountError(error);
  }
});

/** For app pages: users who have not finished setup go back to it. */
export async function completedUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (user.profile.onboardingState !== 'complete') {
    redirect(routeForOnboarding(user.profile.onboardingState));
  }
  return user;
}

/** For onboarding pages: anyone not on this step goes where they belong. */
export async function userOnStep(
  step: CurrentUser['profile']['onboardingState'],
): Promise<CurrentUser> {
  const user = await currentUser();
  if (user.profile.onboardingState !== step) {
    redirect(routeForOnboarding(user.profile.onboardingState));
  }
  return user;
}

/**
 * Renders the shared not-found page when the API answers with one of these
 * codes. Missing and not-yours are the same answer, so they look identical.
 */
export async function orNotFound<Value>(
  work: Promise<Value>,
  codes: readonly string[],
): Promise<Value> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ApiClientError && codes.includes(error.code)) {
      notFound();
    }
    throw error;
  }
}

/** A `?cursor=` value from the URL, kept only if it is a plausible token. */
export function cursorParam(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
    ? value
    : undefined;
}
