import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  MediaAssetId,
  UpdateRoomInput,
  UpdateRoomTopFriendsInput,
  UpdateRoomWidgetsInput,
} from '@paldora/domain';
import {
  createRoomBannerUploadSchema,
  cursorPageSchema,
  updateRoomSchema,
  updateRoomTopFriendsSchema,
  updateRoomWidgetsSchema,
  updateUserPreferencesSchema,
} from '@paldora/validation';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { parseRequest, parseUuid } from './request-validation.js';
import { RoomBannerService } from './room-banner.service.js';
import { RoomContentService } from './room-content.service.js';
import { RoomService } from './room.service.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class RoomController {
  public constructor(
    @Inject(RoomService) private readonly rooms: RoomService,
    @Inject(RoomContentService) private readonly content: RoomContentService,
    @Inject(RoomBannerService) private readonly banners: RoomBannerService,
  ) {}

  @Get('me/room')
  public mine(@Req() request: AuthenticatedRequest) {
    return this.rooms.mine(request.principal.userId);
  }

  @Get('rooms/:username')
  public view(
    @Req() request: AuthenticatedRequest,
    @Param('username') username: string,
  ) {
    return this.rooms.view(request.principal.userId, username);
  }

  @Patch('me/room')
  public update(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.rooms.update(
      request.principal.userId,
      parseRequest(updateRoomSchema, body) as UpdateRoomInput,
    );
  }

  @Put('me/room/widgets')
  public widgets(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.rooms.updateWidgets(
      request.principal.userId,
      parseRequest(updateRoomWidgetsSchema, body) as UpdateRoomWidgetsInput,
    );
  }

  @Put('me/room/top-friends')
  public topFriends(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.rooms.updateTopFriends(
      request.principal.userId,
      parseRequest(
        updateRoomTopFriendsSchema,
        body,
      ) as UpdateRoomTopFriendsInput,
    );
  }

  @Get('rooms/:username/posts')
  public posts(
    @Req() request: AuthenticatedRequest,
    @Param('username') username: string,
    @Query() query: unknown,
  ) {
    return this.content.posts(
      request.principal.userId,
      username,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('rooms/:username/life-updates')
  public lifeUpdates(
    @Req() request: AuthenticatedRequest,
    @Param('username') username: string,
    @Query() query: unknown,
  ) {
    return this.content.lifeUpdates(
      request.principal.userId,
      username,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('rooms/:username/gallery')
  public gallery(
    @Req() request: AuthenticatedRequest,
    @Param('username') username: string,
    @Query() query: unknown,
  ) {
    return this.content.gallery(
      request.principal.userId,
      username,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('rooms/:username/memories')
  public memories(
    @Req() request: AuthenticatedRequest,
    @Param('username') username: string,
    @Query() query: unknown,
  ) {
    return this.content.memories(
      request.principal.userId,
      username,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('me/preferences')
  public preferences(@Req() request: AuthenticatedRequest) {
    return this.rooms.preferences(request.principal.userId);
  }

  @Patch('me/preferences')
  public updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.rooms.updatePreferences(
      request.principal.userId,
      parseRequest(updateUserPreferencesSchema, body),
    );
  }

  @Post('me/room/banner/uploads')
  public createBannerUpload(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.banners.createUpload(
      request.principal.userId,
      parseRequest(createRoomBannerUploadSchema, body),
    );
  }

  @Post('me/room/banner/uploads/:id/complete')
  public completeBannerUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') value: string,
  ) {
    return this.banners.completeUpload(
      request.principal.userId,
      parseUuid<MediaAssetId>(value),
    );
  }

  @Delete('me/room/banner/uploads/:id')
  public cancelBannerUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') value: string,
  ) {
    return this.banners.cancelUpload(
      request.principal.userId,
      parseUuid<MediaAssetId>(value),
    );
  }

  @Delete('me/room/banner')
  public deleteBanner(@Req() request: AuthenticatedRequest) {
    return this.banners.delete(request.principal.userId);
  }
}
