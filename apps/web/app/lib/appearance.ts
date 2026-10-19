import type { Appearance } from '@paldora/domain';

/**
 * A device-side mirror of the server-stored appearance preference, so the
 * root layout can render the right theme before any data loads. PostgreSQL
 * stays the source of truth; this cookie is refreshed on sign-in and save.
 */
export const APPEARANCE_COOKIE = 'pal-appearance';

const explicit = new Set<Appearance>(['light', 'dark']);

/** `system` (or anything unknown) leaves the choice to the OS. */
export function appearanceAttribute(
  value: string | undefined,
): 'light' | 'dark' | undefined {
  return value && explicit.has(value as Appearance)
    ? (value as 'light' | 'dark')
    : undefined;
}

export const appearanceCookieOptions = (secure: boolean) =>
  ({
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  }) as const;
