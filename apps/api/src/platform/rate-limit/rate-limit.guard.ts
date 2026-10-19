import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../api-error.js';
import type { PaldoraRequest } from '../request-context.js';
import { RATE_LIMITER } from '../tokens.js';
import {
  RATE_LIMIT_KEY,
  type RateLimitPolicy,
} from './rate-limit.decorator.js';
import type { RateLimitDecision, RateLimiter } from './rate-limiter.js';

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
      ? `user:${request.principal.userId}`
      : `ip:${request.ip ?? 'unknown'}`;
    let decision: RateLimitDecision;
    try {
      decision = await this.limiter.consume(subject, policy);
    } catch {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'RATE_LIMIT_UNAVAILABLE',
        'This action is temporarily unavailable. Try again shortly.',
      );
    }
    if (!decision.allowed) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many requests. Try again later.',
        { 'Retry-After': String(decision.retryAfterSeconds) },
      );
    }
    return true;
  }
}
