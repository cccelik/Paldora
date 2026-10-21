import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import {
  updatePersonalizationSchema,
  type UpdatePersonalizationInput,
} from '@paldora/validation';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { HOUR, type Principal } from '../platform/http/controller-support.js';
import { ZodPipe } from '../platform/http/zod.pipe.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { RoomPersonalizationService } from './services/room-personalization.service.js';

@Controller()
export class RoomPersonalizationController {
  public constructor(
    @Inject(RoomPersonalizationService)
    private readonly personalization: RoomPersonalizationService,
  ) {}
  @Get('me/room/personalization')
  @Header('Cache-Control', 'private, no-store')
  public mine(@CurrentPrincipal() me: Principal) {
    return this.personalization.source(me.userId);
  }
  @Get('rooms/:username/personalization')
  @Header('Cache-Control', 'private, no-store')
  public rendered(
    @CurrentPrincipal() me: Principal,
    @Param('username') username: string,
  ) {
    return this.personalization.rendered(me.userId, username);
  }
  @Put('me/room/personalization')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ scope: 'room-update', limit: 120, windowSeconds: HOUR })
  public replace(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(updatePersonalizationSchema))
    input: UpdatePersonalizationInput,
  ) {
    return this.personalization.replace(me.userId, input);
  }
}
