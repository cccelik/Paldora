import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, createNonce } from './csp';

const base = {
  nonce: 'abc123',
  webUrl: 'https://paldora.example',
  apiUrl: 'https://api.paldora.example/api/v1',
  supabaseUrl: 'https://project.supabase.co',
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

  it('connects only to the API and auth origins (not wildcards)', () => {
    expect(directive(production, 'connect-src')).toEqual([
      "'self'",
      'https://api.paldora.example',
      'https://project.supabase.co',
    ]);
    expect(production).not.toMatch(/\*|https:(?!\/\/)/);
    expect(production).toContain('upgrade-insecure-requests');
  });

  it('adds the private media origin only when configured', () => {
    const withMedia = buildContentSecurityPolicy({
      ...base,
      development: false,
      mediaOrigin: 'https://media.paldora.example/bucket',
    });
    expect(directive(withMedia, 'img-src')).toContain(
      'https://media.paldora.example',
    );
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
