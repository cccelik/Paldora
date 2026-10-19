import type { VerifiedIdentity } from '@paldora/domain';

/** A fixed identity for tests that stub the access-token verifier. */
export const REQUEST_CONTEXT_TEST_IDENTITY: VerifiedIdentity = {
  subject: 'test-subject',
  sessionId: 'test-session',
  expiresAt: new Date('2999-01-01T00:00:00.000Z'),
};
