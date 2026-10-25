'use server';

import { invalidOutcome, type ActionResult } from '@/lib/actions/action-result';
import { textField } from '@/lib/actions/form-data';
import {
  APPEARANCE_COOKIE,
  appearanceCookieOptions,
} from '@/lib/server/appearance';
import { firebaseLocalWebUrl } from '@/lib/server/firebase/mode';
import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import {
  FIREBASE_SESSION_COOKIE,
  firebaseAdminServices,
} from '@/lib/server/firebase/session';
import { routeForOnboarding } from '@/lib/server/onboarding';

import { NativeProfiles } from '@paldora/firebase-trusted';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
/** Signs in an admitted account and exchanges the ID token for a session cookie. */
export async function signInAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = textField(formData, 'email').trim();
  const password = textField(formData, 'password');
  if (!email || !password)
    return invalidOutcome('Enter your email and password.');
  {
    await requireFirebaseActionOrigin();
    let destination: Route;
    try {
      const { uid, cookie } = await firebaseAdminServices().sessions.signIn(
        email,
        password,
      );
      const user = await new NativeProfiles(
        firebaseAdminServices().db,
        firebaseAdminServices().auth,
      ).current(uid);
      const jar = await cookies();
      jar.set(FIREBASE_SESSION_COOKIE, cookie, {
        httpOnly: true,
        secure: firebaseLocalWebUrl().startsWith('https://'),
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
      jar.set(
        APPEARANCE_COOKIE,
        user.preferences.appearance,
        appearanceCookieOptions(firebaseLocalWebUrl().startsWith('https://')),
      );
      destination =
        user.profile.onboardingState === 'complete'
          ? '/boxes'
          : routeForOnboarding(user.profile.onboardingState);
    } catch {
      return invalidOutcome('That email and password don’t match an account.');
    }
    redirect(destination);
  }
}

/** Always answers the same way, so it cannot reveal which emails exist. */
export async function forgotPasswordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const email = textField(formData, 'email').trim();
  if (!email) return invalidOutcome('Enter the email for your account.');
  {
    await requireFirebaseActionOrigin();
    await firebaseAdminServices().sessions.requestPasswordReset(email);
    return {
      status: 'success',
      message: 'If that account exists, a reset link is on its way.',
      data: undefined,
    };
  }
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
  if (problem) return invalidOutcome(problem);
  {
    await requireFirebaseActionOrigin();
    try {
      await firebaseAdminServices().sessions.resetPassword(
        textField(formData, 'oobCode'),
        password,
      );
      (await cookies()).delete(FIREBASE_SESSION_COOKIE);
      return {
        status: 'success',
        message: 'Password updated.',
        data: undefined,
      };
    } catch {
      return invalidOutcome('This reset link expired. Request a new one.');
    }
  }
}

export async function signOutAction(): Promise<void> {
  {
    await requireFirebaseActionOrigin();
    const jar = await cookies();
    jar.delete(FIREBASE_SESSION_COOKIE);
    jar.delete(APPEARANCE_COOKIE);
    redirect('/sign-in');
  }
}
