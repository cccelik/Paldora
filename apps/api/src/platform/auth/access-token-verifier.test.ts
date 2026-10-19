import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { JoseAccessTokenVerifier } from './access-token-verifier.js';

const issuer = 'https://auth.test/auth/v1';
const audience = 'authenticated';
let privateKey: CryptoKey;
let verifier: JoseAccessTokenVerifier;

async function token(
  claims: Record<string, unknown> = {},
  options: { issuer?: string; audience?: string; expiresIn?: string } = {},
) {
  return new SignJWT({ session_id: 'session-1', ...claims })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setSubject('subject-1')
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: 'test-key',
    alg: 'ES256',
  };
  verifier = new JoseAccessTokenVerifier({
    issuer,
    audience,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe('JoseAccessTokenVerifier', () => {
  it('returns the identity of a valid token', async () => {
    const identity = await verifier.verify(await token());
    expect(identity.subject).toBe('subject-1');
    expect(identity.sessionId).toBe('session-1');
    expect(identity.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    [
      'a foreign issuer',
      () => token({}, { issuer: 'https://evil.test/auth/v1' }),
    ],
    ['a foreign audience', () => token({}, { audience: 'anon' })],
    ['an expired token', () => token({}, { expiresIn: '-1m' })],
    ['garbage', async () => 'not-a-jwt'],
  ])('rejects %s as AUTHENTICATION_REQUIRED', async (_name, makeToken) => {
    await expect(verifier.verify(await makeToken())).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('rejects a token signed with a symmetric secret (algorithm confusion)', async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setSubject('attacker')
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('guessable-shared-secret-value-123'));
    await expect(verifier.verify(forged)).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('rejects unsigned tokens', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'x',
        iss: issuer,
        aud: audience,
        exp: 9_999_999_999,
      }),
    ).toString('base64url');
    await expect(
      verifier.verify(`${header}.${payload}.`),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });
});
