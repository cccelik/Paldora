import { routeForOnboarding } from '@/lib/server/onboarding';
import {
  firebaseAdminServices,
  firebaseSessionUid,
} from '@/lib/server/firebase/session';
import { NativeProfiles } from '@paldora/firebase-trusted';
import { type CurrentUser } from '@paldora/validation';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import 'server-only';
import { ApiClientError } from '@/lib/server/web-data-error';

/** The signed-in user, once per render pass. */
export const currentUser = cache(async (): Promise<CurrentUser> => {
  const uid = await firebaseSessionUid();
  if (!uid) redirect('/sign-in');
  const { db, auth } = firebaseAdminServices();
  const current = await new NativeProfiles(db, auth)
    .current(uid)
    .catch(() => redirect('/account-unavailable'));
  const profile = await db.collection('nativeProfiles').doc(uid).get();
  const avatarId = profile.get('avatarMediaId') as string | undefined;
  if (avatarId) {
    const asset = await db.collection('nativeMediaAssets').doc(avatarId).get();
    if (asset.get('status') === 'ready' && asset.get('ownerUid') === uid) {
      const root = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '') ?? '';
      current.profile.avatar = {
        url: `${root}/media/${avatarId}/display`,
        thumbnailUrl: `${root}/media/${avatarId}/thumbnail`,
      };
    }
  }
  current.profile.avatarProcessing = Boolean(
    profile.get('pendingAvatarMediaId'),
  );
  return current;
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
