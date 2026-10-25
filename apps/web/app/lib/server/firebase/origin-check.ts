/** Local Next.js may serve the same app from either loopback hostname. */
export function isAllowedFirebaseActionOrigin(
  origin: string | null,
  host: string | null,
  expected: string,
  local: boolean,
): boolean {
  if (!origin) return false;
  if (origin === expected) return true;
  if (!local || !host) return false;
  try {
    const actual = new URL(origin);
    const configured = new URL(expected);
    return (
      actual.protocol === configured.protocol &&
      actual.port === configured.port &&
      ['localhost', '127.0.0.1'].includes(actual.hostname) &&
      actual.host === host
    );
  } catch {
    return false;
  }
}
