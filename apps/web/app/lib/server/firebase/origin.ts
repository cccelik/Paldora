import { headers } from 'next/headers';
import { firebaseLocalWebUrl } from './mode';
import { isAllowedFirebaseActionOrigin } from './origin-check';
import 'server-only';

/** Reject cross-site or origin-less writes before any trusted mutation. */
export async function requireFirebaseActionOrigin(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  const expected = new URL(firebaseLocalWebUrl()).origin;
  if (
    !isAllowedFirebaseActionOrigin(
      origin,
      requestHeaders.get('host'),
      expected,
      process.env.PALDORA_ENV === 'local',
    )
  )
    throw new Error('Firebase web mutation origin rejected.');
}
