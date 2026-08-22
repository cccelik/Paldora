import type { UserId } from '@paldora/domain';

export interface AuthenticatedPrincipal {
  userId: UserId;
  authSubject: string;
  sessionId: string;
}

export interface VerifiedIdentity {
  subject: string;
  sessionId: string;
  email: string;
}

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason: 'unauthenticated' | 'forbidden' | 'blocked' };

export const denyByDefault = (): AuthorizationDecision => ({
  allowed: false,
  reason: 'forbidden',
});
