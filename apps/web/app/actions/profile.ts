'use server';

import {
  actionError,
  invalidOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
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
  firebaseSessionUid,
} from '@/lib/server/firebase/session';
import { NativeProfileError, NativeProfiles } from '@paldora/firebase-trusted';
import { appearanceSchema, updateProfileSchema } from '@paldora/validation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
const profileCopy = {
  USERNAME_UNAVAILABLE: 'That username is taken. Try another.',
  ONBOARDING_INCOMPLETE: 'Finish the earlier steps first.',
};

async function saveProfile(changes: {
  username?: string;
  displayName?: string;
  bio?: string;
  onboardingState?: 'profile' | 'avatar' | 'complete';
}): Promise<ActionResult> {
  try {
    {
      await requireFirebaseActionOrigin();
      const parsed = updateProfileSchema.safeParse(changes);
      if (!parsed.success)
        return invalidOutcome('Check the details and try again.');
      const uid = await firebaseSessionUid();
      if (!uid) return invalidOutcome('Sign in to continue.');
      const { db, auth } = firebaseAdminServices();
      await new NativeProfiles(db, auth).update(uid, parsed.data);
      return { status: 'success', message: 'Saved.', data: undefined };
    }
  } catch (error) {
    if (error instanceof NativeProfileError)
      return invalidOutcome(
        error.code === 'TAKEN'
          ? profileCopy.USERNAME_UNAVAILABLE
          : 'Check the details and try again.',
      );
    return actionError(error, profileCopy);
  }
}

export async function saveUsernameAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await saveProfile({
    username: textField(formData, 'username'),
    onboardingState: 'profile',
  });
  if (result.status !== 'success') return result;
  redirect('/onboarding/profile');
}

export async function saveProfileStepAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await saveProfile({
    displayName: textField(formData, 'displayName'),
    bio: textField(formData, 'bio'),
    onboardingState: 'avatar',
  });
  if (result.status !== 'success') return result;
  redirect('/onboarding/avatar');
}

/**
 * Ends onboarding, with or without a photo. A failure here is unexpected
 * (every earlier step is already saved), so it surfaces as the error page.
 */
export async function finishOnboardingAction(): Promise<void> {
  {
    await requireFirebaseActionOrigin();
    const uid = await firebaseSessionUid();
    if (!uid) redirect('/sign-in');
    const { db, auth } = firebaseAdminServices();
    await new NativeProfiles(db, auth).update(uid, {
      onboardingState: 'complete',
    });
    redirect('/boxes');
  }
}

export async function saveAccountAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await saveProfile({
    username: textField(formData, 'username'),
    displayName: textField(formData, 'displayName'),
    bio: textField(formData, 'bio'),
  });
  if (result.status === 'success') revalidatePath('/', 'layout');
  return result.status === 'success'
    ? { ...result, message: 'Changes saved.' }
    : result;
}

export async function saveAppearanceAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = appearanceSchema.safeParse(textField(formData, 'appearance'));
  if (!parsed.success) {
    return invalidOutcome('Choose light, dark, or system.');
  }
  try {
    {
      await requireFirebaseActionOrigin();
      const uid = await firebaseSessionUid();
      if (!uid) return invalidOutcome('Sign in to continue.');
      const { db, auth } = firebaseAdminServices();
      const saved = await new NativeProfiles(db, auth).updatePreferences(uid, {
        appearance: parsed.data,
      });
      (await cookies()).set(
        APPEARANCE_COOKIE,
        saved.appearance,
        appearanceCookieOptions(firebaseLocalWebUrl().startsWith('https://')),
      );
      revalidatePath('/', 'layout');
      return {
        status: 'success',
        message: 'Appearance saved.',
        data: undefined,
      };
    }
  } catch (error) {
    return actionError(error);
  }
}

export async function changePasswordAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const currentPassword = textField(formData, 'currentPassword');
  const nextPassword = textField(formData, 'nextPassword');
  const confirmation = textField(formData, 'confirmation');
  if (
    !currentPassword ||
    nextPassword.length < 10 ||
    nextPassword !== confirmation
  )
    return invalidOutcome('Check the passwords and try again.');
  try {
    await requireFirebaseActionOrigin();
    const uid = await firebaseSessionUid();
    if (!uid) return invalidOutcome('Sign in to continue.');
    const { auth, sessions } = firebaseAdminServices();
    const email = (await auth.getUser(uid)).email;
    if (!email) return invalidOutcome('Password change is unavailable.');
    await sessions.changePassword(uid, email, currentPassword, nextPassword);
    (await cookies()).delete(FIREBASE_SESSION_COOKIE);
    return {
      status: 'success',
      message: 'Password changed. Sign in again to continue.',
      data: undefined,
    };
  } catch {
    return invalidOutcome(
      'That password could not be changed. Check your current password and try again.',
    );
  }
}
