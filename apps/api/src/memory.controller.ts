import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { BoxId } from '@paldora/domain';
import { memoryQuerySchema } from '@paldora/validation';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { MemoryService } from './memory.service.js';
import { parseRequest, parseUuid } from './request-validation.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class MemoryController {
  public constructor(
    @Inject(MemoryService) private readonly memories: MemoryService,
  ) {}

  @Get('me/memories/years')
  public years(@Req() request: AuthenticatedRequest) {
    return this.memories.years(request.principal.userId);
  }

  @Get('me/memories')
  public mine(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.memories.mine(
      request.principal.userId,
      parseRequest(memoryQuerySchema, query),
    );
  }

  @Get('boxes/:boxId/memories/years')
  public boxYears(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') value: string,
  ) {
    return this.memories.years(
      request.principal.userId,
      parseUuid<BoxId>(value),
    );
  }

  @Get('boxes/:boxId/memories')
  public box(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') value: string,
    @Query() query: unknown,
  ) {
    return this.memories.box(
      request.principal.userId,
      parseUuid<BoxId>(value),
      parseRequest(memoryQuerySchema, query),
    );
  }
}
