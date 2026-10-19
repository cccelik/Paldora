import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose';
import { JoseAccessTokenVerifier } from '../platform/auth/access-token-verifier.js';

const issuer = 'https://auth.integration.test/auth/v1';
const audience = 'authenticated';

/**
 * A local stand-in for Supabase Auth: real ES256 signatures verified by the
 * production verifier, so integration tests exercise the whole token path.
 */
export class LocalIssuer {
  private constructor(
    private readonly privateKey: CryptoKey,
    public readonly verifier: JoseAccessTokenVerifier,
  ) {}

  public static async create(): Promise<LocalIssuer> {
    const pair = await generateKeyPair('ES256');
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'local',
      alg: 'ES256',
    };
    return new LocalIssuer(
      pair.privateKey,
      new JoseAccessTokenVerifier({
        issuer,
        audience,
        keys: createLocalJWKSet({ keys: [jwk] }),
      }),
    );
  }

  public token(subject: string, expiresIn = '10m'): Promise<string> {
    return new SignJWT({ session_id: `session-${subject}` })
      .setProtectedHeader({ alg: 'ES256', kid: 'local' })
      .setSubject(subject)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.privateKey);
  }
}
