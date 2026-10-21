'use server';

import { type ProfileChanges } from '@paldora/api-client';
import { appearanceSchema } from '@paldora/validation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  actionError,
  invalidOutcome,
  type ActionResult,
} from '../lib/action-result';
import { APPEARANCE_COOKIE, appearanceCookieOptions } from '../lib/appearance';
import { publicEnvironment } from '../lib/environment';
import { textField } from '../lib/form-data';
import { apiClient } from '../lib/session';
const profileCopy = {
  USERNAME_UNAVAILABLE: 'That username is taken. Try another.',
  ONBOARDING_INCOMPLETE: 'Finish the earlier steps first.',
};

async function saveProfile(changes: ProfileChanges): Promise<ActionResult> {
  try {
    await (await apiClient()).updateProfile(changes);
    return { status: 'success', message: 'Saved.', data: undefined };
  } catch (error) {
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
  await (await apiClient()).updateProfile({ onboardingState: 'complete' });
  redirect('/home');
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
    const saved = await (
      await apiClient()
    ).updatePreferences({ appearance: parsed.data });
    (await cookies()).set(
      APPEARANCE_COOKIE,
      saved.appearance,
      appearanceCookieOptions(
        publicEnvironment().NEXT_PUBLIC_WEB_URL.startsWith('https://'),
      ),
    );
  } catch (error) {
    return actionError(error);
  }
  revalidatePath('/', 'layout');
  return { status: 'success', message: 'Appearance saved.', data: undefined };
}
