import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedPrincipal, VerifiedIdentity } from '@paldora/auth';
import { users } from '@paldora/database';
import type { UserId } from '@paldora/domain';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';

export interface AuthenticatedRequest extends Request {
  principal: AuthenticatedPrincipal;
}

@Injectable()
export class SupabaseTokenVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  public constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
    this.issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
    this.audience = process.env.SUPABASE_JWT_AUDIENCE ?? 'authenticated';
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
  }

  public async verify(token: string): Promise<VerifiedIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      const email = payload.email;
      if (!payload.sub || typeof email !== 'string') throw new Error('claims');
      return {
        subject: payload.sub,
        email,
        sessionId:
          typeof payload.session_id === 'string'
            ? payload.session_id
            : (payload.jti ?? payload.sub),
      };
    } catch {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        'Your session is missing or no longer valid.',
      );
    }
  }
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  public constructor(
    @Inject(SupabaseTokenVerifier)
    private readonly verifier: SupabaseTokenVerifier,
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new ApiError(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        'Sign in to continue.',
      );
    }
    const identity = await this.verifier.verify(authorization.slice(7));
    const [user] = await this.infrastructure.databaseClient
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.authSubject, identity.subject))
      .limit(1);
    if (!user) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_NOT_PROVISIONED',
        'This Paldora account has not been provisioned.',
      );
    }
    if (user.status !== 'active') {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_BLOCKED',
        'This account is not available.',
      );
    }
    request.principal = {
      userId: user.id as UserId,
      authSubject: identity.subject,
      sessionId: identity.sessionId,
    };
    await this.infrastructure.databaseClient
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return true;
  }
}
