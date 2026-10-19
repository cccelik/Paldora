'use server';

import { ApiClientError } from '@paldora/api-client';
import { redirect } from 'next/navigation';
import { authenticatedApiClient } from '../lib/api';

export interface ProfileActionState {
  status: 'idle' | 'error' | 'success';
  message?: string;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'USERNAME_UNAVAILABLE') return 'Username unavailable.';
    if (error.code === 'VALIDATION_FAILED') return error.message;
  }
  return 'Something went wrong. Try again.';
}

export async function saveUsernameAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const username = String(formData.get('username') ?? '');
    const api = await authenticatedApiClient();
    const availability = await api.usernameAvailability(username);
    if (!availability.available)
      return { status: 'error', message: 'Username unavailable.' };
    await api.updateProfile({ username, onboardingState: 'profile' });
  } catch (error) {
    return { status: 'error', message: messageFor(error) };
  }
  redirect('/onboarding/profile');
}

export async function saveProfileAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    await (
      await authenticatedApiClient()
    ).updateProfile({
      displayName: String(formData.get('displayName') ?? ''),
      bio: String(formData.get('bio') ?? ''),
      onboardingState: 'avatar',
    });
  } catch (error) {
    return { status: 'error', message: messageFor(error) };
  }
  redirect('/onboarding/avatar');
}

export async function saveSettingsAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    await (
      await authenticatedApiClient()
    ).updateProfile({
      username: String(formData.get('username') ?? ''),
      displayName: String(formData.get('displayName') ?? ''),
      bio: String(formData.get('bio') ?? ''),
    });
    return { status: 'success', message: 'Changes saved.' };
  } catch (error) {
    return { status: 'error', message: messageFor(error) };
  }
}
