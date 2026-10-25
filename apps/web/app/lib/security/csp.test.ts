import { buildContentSecurityPolicy, createNonce } from '@/lib/security/csp';
import { describe, expect, it } from 'vitest';
const base = {
  nonce: 'abc123',
  webUrl: 'https://paldora.example',
};

const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((entry) => entry.startsWith(`${name} `))
    ?.slice(name.length + 1)
    .split(' ') ?? [];

describe('content security policy', () => {
  const production = buildContentSecurityPolicy({
    ...base,
    development: false,
  });

  it('allows scripts only through the per-request nonce', () => {
    const scripts = directive(production, 'script-src');
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it('allows no inline styles in production', () => {
    expect(directive(production, 'style-src')).toEqual([
      "'self'",
      "'nonce-abc123'",
    ]);
  });

  it('forbids framing, plugins, and foreign form targets', () => {
    expect(directive(production, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(production, 'object-src')).toEqual(["'none'"]);
    expect(directive(production, 'form-action')).toEqual(["'self'"]);
  });

  it('connects only to the same origin', () => {
    expect(directive(production, 'connect-src')).toEqual(["'self'"]);
    expect(production).not.toMatch(/\*|https:(?!\/\/)/);
    expect(production).toContain('upgrade-insecure-requests');
  });

  it('serves private media only through the same origin', () => {
    expect(directive(production, 'img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
    ]);
  });

  it('relaxes only what development tooling needs', () => {
    const development = buildContentSecurityPolicy({
      ...base,
      webUrl: 'http://localhost:3000',
      development: true,
    });
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(development, 'style-src')).toContain("'unsafe-inline'");
    expect(development).not.toContain('upgrade-insecure-requests');
  });

  it('creates unpredictable nonces', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
