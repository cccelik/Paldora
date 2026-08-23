import {
  Body,
  Controller,
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
  updateBoxMemberSchema,
  updateBoxSchema,
  uuidSchema,
} from '@paldora/validation';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { BoxService } from './box.service.js';
import { parseRequest } from './request-validation.js';

@Controller('boxes')
@UseGuards(SupabaseAuthGuard)
export class BoxController {
  public constructor(@Inject(BoxService) private readonly boxes: BoxService) {}

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
    const boxId = parseRequest(uuidSchema, rawBoxId) as BoxId;
    return this.boxes.get(request.principal.userId, boxId);
  }

  @Patch(':boxId')
  public update(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseRequest(uuidSchema, rawBoxId) as BoxId;
    const input = parseRequest(updateBoxSchema, body);
    return this.boxes.update(request.principal.userId, boxId, input);
  }

  @Get(':boxId/members')
  public members(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
  ) {
    const boxId = parseRequest(uuidSchema, rawBoxId) as BoxId;
    return this.boxes.members(request.principal.userId, boxId);
  }

  @Post(':boxId/invitations')
  public invite(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseRequest(uuidSchema, rawBoxId) as BoxId;
    const input = parseRequest(createBoxInvitationSchema, body);
    return this.boxes.invite(request.principal.userId, boxId, input.username);
  }

  @Patch(':boxId/members/:userId')
  public updateMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Param('userId') rawUserId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseRequest(uuidSchema, rawBoxId) as BoxId;
    const userId = parseRequest(uuidSchema, rawUserId) as UserId;
    const input = parseRequest(updateBoxMemberSchema, body);
    return this.boxes.updateMemberRole(
      request.principal.userId,
      boxId,
      userId,
      input.role,
    );
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
    const invitationId = parseRequest(
      uuidSchema,
      rawInvitationId,
    ) as BoxInvitationId;
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
    const invitationId = parseRequest(
      uuidSchema,
      rawInvitationId,
    ) as BoxInvitationId;
    return this.boxes.respondToInvitation(
      request.principal.userId,
      invitationId,
      'declined',
    );
  }
}
