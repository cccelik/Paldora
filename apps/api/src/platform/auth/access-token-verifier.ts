import type { VerifiedIdentity } from '@paldora/domain';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { authenticationRequired } from '../http/api-error.js';

export interface AccessTokenVerifier {
  /** Resolves the identity or throws `AUTHENTICATION_REQUIRED`. */
  verify(token: string): Promise<VerifiedIdentity>;
}

export interface JoseVerifierOptions {
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
}

/** Asymmetric algorithms only: a leaked shared secret cannot mint tokens. */
const allowedAlgorithms = ['ES256', 'RS256'];

function sessionIdOf(payload: JWTPayload): string {
  if (typeof payload.session_id === 'string') return payload.session_id;
  return payload.jti ?? payload.sub ?? 'unknown';
}

export class JoseAccessTokenVerifier implements AccessTokenVerifier {
  public constructor(private readonly options: JoseVerifierOptions) {}

  public async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.options.keys, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: allowedAlgorithms,
        requiredClaims: ['sub', 'exp'],
        clockTolerance: 5,
      });
      return {
        subject: payload.sub as string,
        sessionId: sessionIdOf(payload),
        expiresAt: new Date((payload.exp as number) * 1_000),
      };
    } catch {
      // Never reveal why verification failed (expired vs forged vs malformed).
      throw authenticationRequired();
    }
  }
}

/** Supabase Auth issues access tokens signed with keys from its JWKS endpoint. */
export function createSupabaseTokenVerifier(environment: {
  SUPABASE_URL: string;
  SUPABASE_JWT_AUDIENCE: string;
}): AccessTokenVerifier {
  const issuer = `${environment.SUPABASE_URL}/auth/v1`;
  return new JoseAccessTokenVerifier({
    issuer,
    audience: environment.SUPABASE_JWT_AUDIENCE,
    keys: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60 * 1_000,
      cooldownDuration: 30 * 1_000,
    }),
  });
}
