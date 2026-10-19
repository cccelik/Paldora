import { HttpStatus } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api-error.js';
import { SupabaseTokenVerifier } from '../src/auth.service.js';

describe('SupabaseTokenVerifier', () => {
  let privateKey: CryptoKey;

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://paldora-test.supabase.co';
    process.env.SUPABASE_JWT_AUDIENCE = 'authenticated';
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'phase-1' }] }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_JWT_AUDIENCE;
  });

  async function token(issuer: string, expiration = '5m'): Promise<string> {
    return new SignJWT({
      email: 'friend@example.com',
      session_id: 'session-id',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'phase-1' })
      .setSubject('supabase-user-id')
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(expiration)
      .sign(privateKey);
  }

  it('accepts a correctly issued, unexpired access token', async () => {
    const verifier = new SupabaseTokenVerifier();
    await expect(
      verifier.verify(await token('https://paldora-test.supabase.co/auth/v1')),
    ).resolves.toEqual({
      subject: 'supabase-user-id',
      email: 'friend@example.com',
      sessionId: 'session-id',
    });
  });

  it('fails closed for the wrong issuer or an expired token', async () => {
    const wrongIssuer = new SupabaseTokenVerifier();
    await expectUnauthorized(
      wrongIssuer.verify(await token('https://attacker.example/auth/v1')),
    );

    const expired = new SupabaseTokenVerifier();
    await expectUnauthorized(
      expired.verify(
        await token('https://paldora-test.supabase.co/auth/v1', '0s'),
      ),
    );
  });

  async function expectUnauthorized(result: Promise<unknown>): Promise<void> {
    try {
      await result;
      throw new Error('Expected token verification to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  }
});
