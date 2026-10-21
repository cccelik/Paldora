import {
  PERMISSIONS_POLICY,
  securityHeaders,
} from '@/lib/security/security-headers';
import { describe, expect, it } from 'vitest';
const header = (deployed: boolean, key: string) =>
  securityHeaders({ deployed }).find((entry) => entry.key === key)?.value;

describe('security headers', () => {
  it('allow the camera for this origin only, for camera reactions', () => {
    const directives = PERMISSIONS_POLICY.split(', ');
    expect(directives).toContain('camera=(self)');
    expect(header(false, 'Permissions-Policy')).toBe(PERMISSIONS_POLICY);
  });

  it('keep every other powerful feature off', () => {
    expect(PERMISSIONS_POLICY).toBe(
      'camera=(self), microphone=(), geolocation=(), browsing-topics=()',
    );
  });

  it('send HSTS only when deployed', () => {
    expect(header(false, 'Strict-Transport-Security')).toBeUndefined();
    expect(header(true, 'Strict-Transport-Security')).toContain('max-age=');
  });

  it('never set a second Content-Security-Policy', () => {
    for (const deployed of [false, true]) {
      expect(header(deployed, 'Content-Security-Policy')).toBeUndefined();
    }
  });
});
