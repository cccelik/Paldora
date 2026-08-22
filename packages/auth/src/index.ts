import type { UserId } from '@paldora/domain';

export interface AuthenticatedPrincipal {
  userId: UserId;
  sessionId: string;
}

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason: 'unauthenticated' | 'forbidden' | 'blocked' };

export const denyByDefault = (): AuthorizationDecision => ({
  allowed: false,
  reason: 'forbidden',
});
