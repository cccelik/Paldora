import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  memoryQuerySchema,
  memorySummaryQuerySchema,
  type MemoryQuery,
  type MemorySummaryQuery,
} from '@paldora/validation';
import type { Principal } from '../platform/http/controller-support.js';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { uuidParam } from '../platform/http/uuid-param.js';
import { ZodPipe } from '../platform/http/zod.pipe.js';
import { MemoryQueryService } from './memory-query.service.js';
import { MemorySummaryService } from './memory-summary.service.js';

const pageQuery = new ZodPipe(memoryQuerySchema);
const summaryQuery = new ZodPipe(memorySummaryQuerySchema);

/** Read-only: Memories are derived on every request, so nothing to limit. */
@Controller()
export class MemoriesController {
  public constructor(
    @Inject(MemoryQueryService) private readonly pages: MemoryQueryService,
    @Inject(MemorySummaryService)
    private readonly summaries: MemorySummaryService,
  ) {}

  @Get('me/memories')
  public mine(
    @CurrentPrincipal() me: Principal,
    @Query(pageQuery) query: MemoryQuery,
  ) {
    return this.pages.mine(me.userId, query);
  }

  @Get('me/memories/summary')
  public mySummary(
    @CurrentPrincipal() me: Principal,
    @Query(summaryQuery) query: MemorySummaryQuery,
  ) {
    return this.summaries.mine(me.userId, query.year);
  }

  @Get('boxes/:boxId/memories')
  public ofBox(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Query(pageQuery) query: MemoryQuery,
  ) {
    return this.pages.ofBox(me.userId, boxId, query);
  }

  @Get('boxes/:boxId/memories/summary')
  public boxSummary(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Query(summaryQuery) query: MemorySummaryQuery,
  ) {
    return this.summaries.ofBox(me.userId, boxId, query.year);
  }
}
