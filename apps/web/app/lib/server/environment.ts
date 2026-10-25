/** Validated web origin. Firebase Admin credentials remain server-only. */
export function publicEnvironment(): { NEXT_PUBLIC_WEB_URL: string } {
  const value = process.env.NEXT_PUBLIC_WEB_URL;
  if (!value) throw new Error('NEXT_PUBLIC_WEB_URL is required.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error('NEXT_PUBLIC_WEB_URL must use HTTP or HTTPS.');
  return { NEXT_PUBLIC_WEB_URL: parsed.toString().replace(/\/$/, '') };
}
