import 'server-only';

export function configuredWebOrigin(): string {
  const configuredWebUrl = process.env.NEXT_PUBLIC_WEB_URL;
  if (!configuredWebUrl) {
    throw new Error('NEXT_PUBLIC_WEB_URL is required.');
  }
  const url = new URL(configuredWebUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_WEB_URL must use HTTP or HTTPS.');
  }
  return url.origin;
}
