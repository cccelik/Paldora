import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  createLifeUpdateSchema,
  cursorPageQuerySchema,
} from '@paldora/validation';
import type { z } from 'zod';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../platform/uuid-param.js';
import { ZodPipe } from '../platform/zod.pipe.js';
import { LifeUpdateDeleteService } from './life-update-delete.service.js';
import { LifeUpdatePublishService } from './life-update-publish.service.js';
import { LifeUpdateQueryService } from './life-update-query.service.js';

type Principal = AuthenticatedPrincipal;
type PageQuery = z.output<typeof cursorPageQuerySchema>;
const hour = 3_600;

@Controller()
export class LifeUpdatesController {
  public constructor(
    @Inject(LifeUpdatePublishService)
    private readonly publisher: LifeUpdatePublishService,
    @Inject(LifeUpdateDeleteService)
    private readonly deleter: LifeUpdateDeleteService,
    @Inject(LifeUpdateQueryService)
    private readonly queries: LifeUpdateQueryService,
  ) {}

  @Post('life-updates')
  @RateLimit({ scope: 'life-update-create', limit: 30, windowSeconds: hour })
  public create(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(createLifeUpdateSchema))
    body: z.output<typeof createLifeUpdateSchema>,
  ) {
    return this.publisher.create(me.userId, body);
  }

  @Get('me/life-updates')
  public listMine(
    @CurrentPrincipal() me: Principal,
    @Query(new ZodPipe(cursorPageQuerySchema)) query: PageQuery,
  ) {
    return this.queries.listMine(me.userId, query);
  }

  @Get('life-updates/:lifeUpdateId')
  public get(
    @CurrentPrincipal() me: Principal,
    @Param('lifeUpdateId', uuidParam) lifeUpdateId: string,
  ) {
    return this.queries.get(me.userId, lifeUpdateId);
  }

  @Delete('life-updates/:lifeUpdateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ scope: 'life-update-delete', limit: 30, windowSeconds: hour })
  public async remove(
    @CurrentPrincipal() me: Principal,
    @Param('lifeUpdateId', uuidParam) lifeUpdateId: string,
  ): Promise<void> {
    await this.deleter.remove(me.userId, lifeUpdateId);
  }
}
