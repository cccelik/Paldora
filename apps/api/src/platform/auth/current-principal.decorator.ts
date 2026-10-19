import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import { authenticationRequired } from '../api-error.js';
import type { PaldoraRequest } from '../request-context.js';

/**
 * Injects the principal the global guard resolved. Throws if used on a
 * `@Public()` route, where no principal exists.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const principal = context
      .switchToHttp()
      .getRequest<PaldoraRequest>().principal;
    if (!principal) throw authenticationRequired();
    return principal;
  },
);
