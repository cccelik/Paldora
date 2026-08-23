import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { BoxId, BoxInvitationId, UserId } from '@paldora/domain';
import {
  createBoxInvitationSchema,
  createBoxSchema,
  transferBoxOwnershipSchema,
  updateBoxMemberSchema,
  updateBoxSchema,
} from '@paldora/validation';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { BoxService } from './box.service.js';
import { parseRequest, parseUuid } from './request-validation.js';
import { RateLimitService } from './rate-limit.service.js';

@Controller('boxes')
@UseGuards(SupabaseAuthGuard)
export class BoxController {
  public constructor(
    @Inject(BoxService) private readonly boxes: BoxService,
    @Inject(RateLimitService) private readonly rateLimits: RateLimitService,
  ) {}

  @Get()
  public list(@Req() request: AuthenticatedRequest) {
    return this.boxes.list(request.principal.userId);
  }

  @Post()
  public create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseRequest(createBoxSchema, body);
    return this.boxes.create(request.principal.userId, input.name);
  }

  @Get(':boxId')
  public get(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    return this.boxes.get(request.principal.userId, boxId);
  }

  @Patch(':boxId')
  public update(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const input = parseRequest(updateBoxSchema, body);
    return this.boxes.update(request.principal.userId, boxId, input);
  }

  @Delete(':boxId')
  public deleteBox(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    return this.boxes.deleteBox(request.principal.userId, boxId);
  }

  @Get(':boxId/members')
  public members(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    return this.boxes.members(request.principal.userId, boxId);
  }

  @Post(':boxId/invitations')
  public async invite(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const input = parseRequest(createBoxInvitationSchema, body);
    await this.rateLimits.assertBoxInvitationAllowed(request.principal.userId);
    return this.boxes.invite(request.principal.userId, boxId, input.username);
  }

  @Get(':boxId/invitations')
  public pendingInvitations(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    return this.boxes.pendingInviteeIds(request.principal.userId, boxId);
  }

  @Patch(':boxId/members/:userId')
  public updateMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Param('userId') rawUserId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const userId = parseUuid<UserId>(rawUserId);
    const input = parseRequest(updateBoxMemberSchema, body);
    return this.boxes.updateMemberRole(
      request.principal.userId,
      boxId,
      userId,
      input.role,
    );
  }

  @Patch(':boxId/owner')
  public transferOwnership(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const input = parseRequest(transferBoxOwnershipSchema, body);
    return this.boxes.transferOwnership(
      request.principal.userId,
      boxId,
      input.userId as UserId,
    );
  }

  @Delete(':boxId/members/me')
  public leave(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    return this.boxes.removeMember(
      request.principal.userId,
      boxId,
      request.principal.userId,
    );
  }

  @Delete(':boxId/members/:userId')
  public removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Param('userId') rawUserId: string,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const userId = parseUuid<UserId>(rawUserId);
    return this.boxes.removeMember(request.principal.userId, boxId, userId);
  }
}

@Controller()
@UseGuards(SupabaseAuthGuard)
export class BoxInvitationController {
  public constructor(@Inject(BoxService) private readonly boxes: BoxService) {}

  @Get('me/box-invitations')
  public list(@Req() request: AuthenticatedRequest) {
    return this.boxes.invitations(request.principal.userId);
  }

  @Post('box-invitations/:invitationId/accept')
  public accept(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId') rawInvitationId: string,
  ) {
    const invitationId = parseUuid<BoxInvitationId>(rawInvitationId);
    return this.boxes.respondToInvitation(
      request.principal.userId,
      invitationId,
      'accepted',
    );
  }

  @Post('box-invitations/:invitationId/decline')
  public decline(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId') rawInvitationId: string,
  ) {
    const invitationId = parseUuid<BoxInvitationId>(rawInvitationId);
    return this.boxes.respondToInvitation(
      request.principal.userId,
      invitationId,
      'declined',
    );
  }
}
