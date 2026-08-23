import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FriendshipId, UserId } from '@paldora/domain';
import {
  createBlockSchema,
  createFriendRequestSchema,
  uuidSchema,
} from '@paldora/validation';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { parseRequest } from './request-validation.js';
import { SocialService } from './social.service.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class SocialController {
  public constructor(
    @Inject(SocialService) private readonly social: SocialService,
  ) {}

  @Get('friends')
  public friends(@Req() request: AuthenticatedRequest) {
    return this.social.listFriends(request.principal.userId);
  }

  @Get('friend-requests')
  public requests(@Req() request: AuthenticatedRequest) {
    return this.social.listRequests(request.principal.userId);
  }

  @Post('friend-requests')
  public request(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseRequest(createFriendRequestSchema, body);
    return this.social.request(request.principal.userId, input.username);
  }

  @Post('friend-requests/:friendshipId/accept')
  public accept(
    @Req() request: AuthenticatedRequest,
    @Param('friendshipId') rawFriendshipId: string,
  ) {
    const friendshipId = parseRequest(
      uuidSchema,
      rawFriendshipId,
    ) as FriendshipId;
    return this.social.respond(
      request.principal.userId,
      friendshipId,
      'accepted',
    );
  }

  @Post('friend-requests/:friendshipId/decline')
  public decline(
    @Req() request: AuthenticatedRequest,
    @Param('friendshipId') rawFriendshipId: string,
  ) {
    const friendshipId = parseRequest(
      uuidSchema,
      rawFriendshipId,
    ) as FriendshipId;
    return this.social.respond(
      request.principal.userId,
      friendshipId,
      'declined',
    );
  }

  @Delete('friends/:userId')
  public remove(
    @Req() request: AuthenticatedRequest,
    @Param('userId') rawUserId: string,
  ) {
    const userId = parseRequest(uuidSchema, rawUserId) as UserId;
    return this.social.remove(request.principal.userId, userId);
  }

  @Get('blocks')
  public blocks(@Req() request: AuthenticatedRequest) {
    return this.social.listBlocked(request.principal.userId);
  }

  @Post('blocks')
  public block(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseRequest(createBlockSchema, body);
    return this.social.block(request.principal.userId, input.username);
  }

  @Delete('blocks/:userId')
  public unblock(
    @Req() request: AuthenticatedRequest,
    @Param('userId') rawUserId: string,
  ) {
    const userId = parseRequest(uuidSchema, rawUserId) as UserId;
    return this.social.unblock(request.principal.userId, userId);
  }
}
