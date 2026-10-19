import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { authenticationRequired } from '../api-error.js';
import type { PaldoraRequest } from '../request-context.js';
import { ACCESS_TOKEN_VERIFIER, PRINCIPAL_RESOLVER } from '../tokens.js';
import type { AccessTokenVerifier } from './access-token-verifier.js';
import type { PrincipalResolver } from './principal-resolver.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

const bearerPattern = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

/**
 * Global guard: every route requires a verified bearer token unless marked
 * `@Public()`. It verifies the JWT, then maps `sub` to an active provisioned
 * user. It establishes identity only; resource authorization belongs to
 * feature policies.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly verifier: AccessTokenVerifier,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<PaldoraRequest>();
    const token = bearerPattern.exec(
      request.header('authorization') ?? '',
    )?.[1];
    if (!token) throw authenticationRequired();
    const identity = await this.verifier.verify(token);
    request.principal = await this.principals.resolve(identity);
    return true;
  }
}
