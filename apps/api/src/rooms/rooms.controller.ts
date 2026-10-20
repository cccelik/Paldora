import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Put,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  updateRoomSchema,
  updateRoomTopFriendsSchema,
  updateRoomWidgetsSchema,
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
import { RoomTopFriendsService } from './room-top-friends.service.js';
import { RoomUpdateService } from './room-update.service.js';
import { RoomViewService } from './room-view.service.js';
import { RoomWidgetService } from './room-widget.service.js';

type Principal = AuthenticatedPrincipal;

/** One counter for every Room section, so the editor's saves share it. */
const roomWrites: RateLimitPolicy = {
  scope: 'room-update',
  limit: 120,
  windowSeconds: 3_600,
};

/**
 * Rooms (Phase 7, ADR 017). Reads are unlimited like every other GET:
 * every denial is the same ROOM_NOT_FOUND, so probing names learns
 * nothing. Writes exist only under `/me/room`: there is no route that
 * names another person's Room.
 */
@Controller()
export class RoomsController {
  public constructor(
    @Inject(RoomViewService) private readonly views: RoomViewService,
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
