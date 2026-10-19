import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  BoxId,
  CreateLifeUpdateInput,
  LifeUpdateId,
  MediaAssetId,
  UpdateLifeUpdateInput,
} from '@paldora/domain';
import {
  createLifeUpdateMediaUploadSchema,
  createLifeUpdateSchema,
  cursorPageSchema,
  updateLifeUpdateSchema,
} from '@paldora/validation';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { LifeUpdateMediaService } from './life-update-media.service.js';
import { LifeUpdateService } from './life-update.service.js';
import { parseRequest, parseUuid } from './request-validation.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class LifeUpdateController {
  public constructor(
    @Inject(LifeUpdateService) private readonly updates: LifeUpdateService,
    @Inject(LifeUpdateMediaService)
    private readonly media: LifeUpdateMediaService,
  ) {}

  @Post('me/life-updates')
  public create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseRequest(createLifeUpdateSchema, body);
    return this.updates.create(
      request.principal.userId,
      input as unknown as CreateLifeUpdateInput,
    );
  }

  @Get('me/life-updates')
  public listMine(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.updates.listMine(
      request.principal.userId,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('me/feed/life-updates')
  public listFeed(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.updates.listFeed(
      request.principal.userId,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('boxes/:boxId/life-updates')
  public listBox(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') value: string,
    @Query() query: unknown,
  ) {
    return this.updates.listBox(
      request.principal.userId,
      parseUuid<BoxId>(value),
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('users/:username/life-updates')
  public listUser(
    @Req() request: AuthenticatedRequest,
    @Param('username') username: string,
    @Query() query: unknown,
  ) {
    return this.updates.listUser(
      request.principal.userId,
      username,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('life-updates/:id')
  public get(@Req() request: AuthenticatedRequest, @Param('id') value: string) {
    return this.updates.get(
      request.principal.userId,
      parseUuid<LifeUpdateId>(value),
    );
  }

  @Patch('life-updates/:id')
  public update(
    @Req() request: AuthenticatedRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return this.updates.update(
      request.principal.userId,
      parseUuid<LifeUpdateId>(value),
      parseRequest(
        updateLifeUpdateSchema,
        body,
      ) as unknown as UpdateLifeUpdateInput,
    );
  }

  @Delete('life-updates/:id')
  public delete(
    @Req() request: AuthenticatedRequest,
    @Param('id') value: string,
  ) {
    return this.updates.delete(
      request.principal.userId,
      parseUuid<LifeUpdateId>(value),
    );
  }

  @Post('life-update-media/uploads')
  public createUpload(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.media.createUpload(
      request.principal.userId,
      parseRequest(createLifeUpdateMediaUploadSchema, body),
    );
  }

  @Post('life-update-media/uploads/:id/complete')
  public completeUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') value: string,
  ) {
    return this.media.completeUpload(
      request.principal.userId,
      parseUuid<MediaAssetId>(value),
    );
  }

  @Delete('life-update-media/uploads/:id')
  public cancelUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') value: string,
  ) {
    return this.media.cancelUpload(
      request.principal.userId,
      parseUuid<MediaAssetId>(value),
    );
  }
}
