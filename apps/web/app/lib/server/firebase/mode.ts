import 'server-only';

export function firebaseLocalWebUrl(): string {
  const value = process.env.NEXT_PUBLIC_WEB_URL;
  if (!value) throw new Error('NEXT_PUBLIC_WEB_URL is required.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error('NEXT_PUBLIC_WEB_URL must be HTTP or HTTPS.');
  return parsed.toString().replace(/\/$/, '');
}
