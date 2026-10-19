import type { UserId } from './identifiers.js';

/**
 * The result of verifying an identity-provider access token. It proves who the
 * caller is, never what they may access: authorization is always decided per
 * resource by API policies.
 */
export interface VerifiedIdentity {
  /** Identity-provider subject (`sub`). Mapped to an internal user. */
  readonly subject: string;
  readonly sessionId: string;
  /** Token expiry; long-lived streams must end at or before this instant. */
  readonly expiresAt: Date;
}

/**
 * A verified identity mapped to an active, provisioned Paldora user. Every
 * authenticated route receives one; feature code uses `userId` only.
 */
export interface AuthenticatedPrincipal extends VerifiedIdentity {
  readonly userId: UserId;
}

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Onboarding only moves forward, one step at a time or straight to done. */
export const ONBOARDING_STATES = [
  'username',
  'profile',
  'avatar',
  'complete',
] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];

export const onboardingRank = (state: OnboardingState): number =>
  ONBOARDING_STATES.indexOf(state);

export const APPEARANCES = ['light', 'dark', 'system'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 500;
