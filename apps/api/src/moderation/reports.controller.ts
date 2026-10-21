import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  createReportSchema,
  moderationActionSchema,
  moderationQueueQuerySchema,
  type CreateReportInput,
  type ModerationActionInput,
} from '@paldora/validation';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import {
  HOUR,
  cursorPageQuery,
  type PageQuery,
  type Principal,
} from '../platform/http/controller-support.js';
import { ZodPipe } from '../platform/http/zod.pipe.js';
import { uuidParam } from '../platform/http/uuid-param.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { ReportService } from './report.service.js';

@Controller()
export class ReportsController {
  public constructor(
    @Inject(ReportService) private readonly reports: ReportService,
  ) {}

  @Post('reports')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ scope: 'report', limit: 20, windowSeconds: HOUR })
  public create(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(createReportSchema)) input: CreateReportInput,
  ) {
    return this.reports.create(me.userId, input);
  }

  @Get('me/reports')
  @Header('Cache-Control', 'private, no-store')
  public mine(
    @CurrentPrincipal() me: Principal,
    @Query(cursorPageQuery) query: PageQuery,
  ) {
    return this.reports.mine(me.userId, query);
  }

  @Get('moderation/cases')
  @Header('Cache-Control', 'private, no-store')
  public queue(
    @CurrentPrincipal() me: Principal,
    @Query(new ZodPipe(moderationQueueQuerySchema))
    query: PageQuery & { status: 'open' | 'closed' },
  ) {
    return this.reports.queue(me.userId, query);
  }

  @Get('moderation/cases/:caseId')
  @Header('Cache-Control', 'private, no-store')
  public one(
    @CurrentPrincipal() me: Principal,
    @Param('caseId', uuidParam) caseId: string,
  ) {
    return this.reports.case(me.userId, caseId);
  }

  @Post('moderation/cases/:caseId/actions')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ scope: 'moderation-action', limit: 60, windowSeconds: HOUR })
  public act(
    @CurrentPrincipal() me: Principal,
    @Param('caseId', uuidParam) caseId: string,
    @Body(new ZodPipe(moderationActionSchema)) input: ModerationActionInput,
  ) {
    return this.reports.act(me.userId, caseId, input);
  }

  @Get('moderation/accounts/:accountId')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ scope: 'moderation-lookup', limit: 30, windowSeconds: HOUR })
  public account(
    @CurrentPrincipal() me: Principal,
    @Param('accountId', uuidParam) accountId: string,
  ) {
    return this.reports.account(me.userId, accountId);
  }
}
