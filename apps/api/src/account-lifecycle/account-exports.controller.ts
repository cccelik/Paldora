import { Controller, Get, Header, Inject, Param, Post } from '@nestjs/common';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { HOUR, type Principal } from '../platform/http/controller-support.js';
import { uuidParam } from '../platform/http/uuid-param.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { AccountExportsService } from './account-exports.service.js';

@Controller()
export class AccountExportsController {
  public constructor(
    @Inject(AccountExportsService)
    private readonly exports: AccountExportsService,
  ) {}

  @Post('me/export')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ scope: 'account-export', limit: 3, windowSeconds: 24 * HOUR })
  public request(@CurrentPrincipal() me: Principal) {
    return this.exports.request(me.userId);
  }

  @Get('me/export')
  @Header('Cache-Control', 'private, no-store')
  public latest(@CurrentPrincipal() me: Principal) {
    return this.exports.latest(me.userId);
  }

  @Get('me/export/:exportId/download')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({
    scope: 'account-export-download',
    limit: 30,
    windowSeconds: HOUR,
  })
  public download(
    @CurrentPrincipal() me: Principal,
    @Param('exportId', uuidParam) exportId: string,
  ) {
    return this.exports.download(me.userId, exportId);
  }
}
