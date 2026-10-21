import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Post,
} from '@nestjs/common';
import {
  accountDeletionPasswordSchema,
  type AccountDeletionPassword,
} from '@paldora/validation';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { HOUR, type Principal } from '../platform/http/controller-support.js';
import { ZodPipe } from '../platform/http/zod.pipe.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { AccountDeletionService } from './account-deletion.service.js';

@Controller()
export class AccountDeletionController {
  public constructor(
    @Inject(AccountDeletionService)
    private readonly deletion: AccountDeletionService,
  ) {}

  @Post('me/deletion')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({
    scope: 'account-deletion-request',
    limit: 3,
    windowSeconds: 24 * HOUR,
  })
  public request(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(accountDeletionPasswordSchema))
    input: AccountDeletionPassword,
  ) {
    return this.deletion.request(me, input.password);
  }

  @Get('me/deletion')
  @Header('Cache-Control', 'private, no-store')
  public current(@CurrentPrincipal() me: Principal) {
    return this.deletion.current(me.userId);
  }

  @Delete('me/deletion')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({
    scope: 'account-deletion-cancel',
    limit: 10,
    windowSeconds: 24 * HOUR,
  })
  public cancel(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(accountDeletionPasswordSchema))
    input: AccountDeletionPassword,
  ) {
    return this.deletion.cancel(me, input.password);
  }
}
