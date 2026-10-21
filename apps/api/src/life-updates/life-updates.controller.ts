import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createLifeUpdateSchema,
  updateLifeUpdateSchema,
} from '@paldora/validation';
import type { z } from 'zod';
import {
  cursorPageQuery,
  HOUR,
  type PageQuery,
  type Principal,
} from '../platform/http/controller-support.js';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../platform/http/uuid-param.js';
import { ZodPipe } from '../platform/http/zod.pipe.js';
import { LifeUpdateDeleteService } from './life-update-delete.service.js';
import { LifeUpdateEditService } from './life-update-edit.service.js';
import { LifeUpdatePublishService } from './life-update-publish.service.js';
import { LifeUpdateQueryService } from './life-update-query.service.js';

@Controller()
export class LifeUpdatesController {
  public constructor(
    @Inject(LifeUpdatePublishService)
    private readonly publisher: LifeUpdatePublishService,
    @Inject(LifeUpdateEditService)
    private readonly editor: LifeUpdateEditService,
    @Inject(LifeUpdateDeleteService)
    private readonly deleter: LifeUpdateDeleteService,
    @Inject(LifeUpdateQueryService)
    private readonly queries: LifeUpdateQueryService,
  ) {}

  @Post('life-updates')
  @RateLimit({ scope: 'life-update-create', limit: 30, windowSeconds: HOUR })
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
    @Query(cursorPageQuery) query: PageQuery,
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

  @Patch('life-updates/:lifeUpdateId')
  @RateLimit({ scope: 'life-update-edit', limit: 30, windowSeconds: HOUR })
  public update(
    @CurrentPrincipal() me: Principal,
    @Param('lifeUpdateId', uuidParam) lifeUpdateId: string,
    @Body(new ZodPipe(updateLifeUpdateSchema))
    body: z.output<typeof updateLifeUpdateSchema>,
  ) {
    return this.editor.update(me.userId, lifeUpdateId, body);
  }

  @Delete('life-updates/:lifeUpdateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ scope: 'life-update-delete', limit: 30, windowSeconds: HOUR })
  public async remove(
    @CurrentPrincipal() me: Principal,
    @Param('lifeUpdateId', uuidParam) lifeUpdateId: string,
  ): Promise<void> {
    await this.deleter.remove(me.userId, lifeUpdateId);
  }
}
