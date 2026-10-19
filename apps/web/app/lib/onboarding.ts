import type { OnboardingState } from '@paldora/domain';
import type { Route } from 'next';

const onboardingRoutes = {
  username: '/onboarding/username',
  profile: '/onboarding/profile',
  avatar: '/onboarding/avatar',
  complete: '/home',
} as const satisfies Record<OnboardingState, Route>;

/** Where a user in this onboarding state belongs. */
export const routeForOnboarding = (state: OnboardingState): Route =>
  onboardingRoutes[state];
