import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PaldoraRequest } from '../request-context.js';
import { RATE_LIMITER } from '../tokens.js';
import { assertWithinLimit, userSubject } from './assert-within-limit.js';
import {
  RATE_LIMIT_KEY,
  type RateLimitPolicy,
} from './rate-limit.decorator.js';
import type { RateLimiter } from './rate-limiter.js';

/** Runs after the auth guard, so authenticated limits key on identity. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<RateLimitPolicy | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!policy) return true;
    const request = context.switchToHttp().getRequest<PaldoraRequest>();
    const subject = request.principal
      ? userSubject(request.principal.userId)
      : `ip:${request.ip ?? 'unknown'}`;
    await assertWithinLimit(this.limiter, subject, policy);
    return true;
  }
}
