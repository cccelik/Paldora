import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  roomContentQuerySchema,
  roomContentSummaryQuerySchema,
  roomPhotoQuerySchema,
  updateRoomSchema,
  updateRoomTopFriendsSchema,
  updateRoomWidgetsSchema,
  type MemorySummaryQuery,
  type RoomContentQuery,
  type RoomPhotoQuery,
  type UpdateRoomInput,
  type UpdateRoomTopFriendsInput,
  type UpdateRoomWidgetsInput,
} from '@paldora/validation';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import {
  RateLimit,
  type RateLimitPolicy,
} from '../platform/rate-limit/rate-limit.decorator.js';
import { ZodPipe } from '../platform/zod.pipe.js';
import { RoomContentService } from './room-content.service.js';
import { RoomTopFriendsService } from './room-top-friends.service.js';
import { RoomUpdateService } from './room-update.service.js';
import { RoomViewService } from './room-view.service.js';
import { RoomWidgetService } from './room-widget.service.js';

type Principal = AuthenticatedPrincipal;
const contentQuery = new ZodPipe(roomContentQuerySchema);
const summaryQuery = new ZodPipe(roomContentSummaryQuerySchema);
const photoQuery = new ZodPipe(roomPhotoQuerySchema);

/** One counter for every Room section, so the editor's saves share it. */
const roomWrites: RateLimitPolicy = {
  scope: 'room-update',
  limit: 120,
  windowSeconds: 3_600,
};

/**
 * Rooms (Phase 7, ADR 017). Reads, the content previews included, are
 * unlimited like every other GET (plan §E, K8): every denial is the same
 * ROOM_NOT_FOUND, so probing names learns nothing, and previews are derived
 * per request from what the viewer can already read elsewhere. Writes exist only under `/me/room`: there is no route that
 * names another person's Room.
 */
@Controller()
export class RoomsController {
  public constructor(
    @Inject(RoomViewService) private readonly views: RoomViewService,
    @Inject(RoomContentService) private readonly content: RoomContentService,
    @Inject(RoomUpdateService) private readonly settings: RoomUpdateService,
    @Inject(RoomWidgetService) private readonly widgets: RoomWidgetService,
    @Inject(RoomTopFriendsService)
    private readonly topFriends: RoomTopFriendsService,
  ) {}

  @Get('me/room')
  public mine(@CurrentPrincipal() me: Principal) {
    return this.views.forOwner(me.userId);
  }

  /** No pipe on purpose: a malformed name is ROOM_NOT_FOUND, not a 400. */
  @Get('rooms/:username')
  public get(
    @CurrentPrincipal() me: Principal,
    @Param('username') username: string,
  ) {
    return this.views.forViewer(me.userId, username);
  }

  /**
   * Room previews. The username is unpiped like `GET /rooms/{username}`;
   * a malformed query is a VALIDATION_FAILED whatever the name, so it says
   * nothing about the Room either.
   */
  @Get('rooms/:username/content')
  public listContent(
    @CurrentPrincipal() me: Principal,
    @Param('username') username: string,
    @Query(contentQuery) query: RoomContentQuery,
  ) {
    return this.content.content(me.userId, username, query);
  }

  @Get('rooms/:username/content/summary')
  public contentSummary(
    @CurrentPrincipal() me: Principal,
    @Param('username') username: string,
    @Query(summaryQuery) query: MemorySummaryQuery,
  ) {
    return this.content.summary(me.userId, username, query.year);
  }

  @Get('rooms/:username/photos')
  public listPhotos(
    @CurrentPrincipal() me: Principal,
    @Param('username') username: string,
    @Query(photoQuery) query: RoomPhotoQuery,
  ) {
    return this.content.photos(me.userId, username, query);
  }

  @Patch('me/room')
  @RateLimit(roomWrites)
  public update(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(updateRoomSchema)) body: UpdateRoomInput,
  ) {
    return this.settings.update(me.userId, body);
  }

  @Put('me/room/widgets')
  @RateLimit(roomWrites)
  public updateWidgets(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(updateRoomWidgetsSchema)) body: UpdateRoomWidgetsInput,
  ) {
    return this.widgets.replace(me.userId, body);
  }

  @Put('me/room/top-friends')
  @RateLimit(roomWrites)
  public updateTopFriends(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(updateRoomTopFriendsSchema))
    body: UpdateRoomTopFriendsInput,
  ) {
    return this.topFriends.replace(me.userId, body);
  }
}
