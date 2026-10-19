import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  createBoxInvitationSchema,
  createBoxSchema,
  cursorPageQuerySchema,
  deleteBoxQuerySchema,
  transferBoxOwnershipSchema,
  updateBoxMemberSchema,
  updateBoxSchema,
} from '@paldora/validation';
import type { z } from 'zod';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import {
  RateLimit,
  RateLimitExempt,
} from '../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../platform/uuid-param.js';
import { ZodPipe } from '../platform/zod.pipe.js';
import { BoxInvitationService } from './box-invitation.service.js';
import { BoxLifecycleService } from './box-lifecycle.service.js';
import { BoxMemberService } from './box-member.service.js';
import { BoxQueryService } from './box-query.service.js';

type Principal = AuthenticatedPrincipal;
type PageQuery = z.output<typeof cursorPageQuerySchema>;
const pageQuery = new ZodPipe(cursorPageQuerySchema);

const hour = 3_600;

@Controller('boxes')
export class BoxesController {
  public constructor(
    @Inject(BoxQueryService) private readonly queries: BoxQueryService,
    @Inject(BoxLifecycleService)
    private readonly lifecycle: BoxLifecycleService,
    @Inject(BoxMemberService) private readonly members: BoxMemberService,
    @Inject(BoxInvitationService)
    private readonly invitations: BoxInvitationService,
  ) {}

  @Get()
  public list(
    @CurrentPrincipal() me: Principal,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.queries.list(me.userId, query);
  }

  @Post()
  @RateLimit({ scope: 'box-create', limit: 20, windowSeconds: hour })
  public create(
    @CurrentPrincipal() me: Principal,
    @Body(new ZodPipe(createBoxSchema)) body: z.output<typeof createBoxSchema>,
  ) {
    return this.lifecycle.create(me.userId, body.name);
  }

  @Get(':boxId')
  public get(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
  ) {
    return this.queries.get(me.userId, boxId);
  }

  @Patch(':boxId')
  @RateLimit({ scope: 'box-update', limit: 60, windowSeconds: hour })
  public update(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Body(new ZodPipe(updateBoxSchema)) body: z.output<typeof updateBoxSchema>,
  ) {
    return this.lifecycle.update(me.userId, boxId, body);
  }

  @Delete(':boxId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ scope: 'box-delete', limit: 20, windowSeconds: hour })
  public async remove(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Query(new ZodPipe(deleteBoxQuerySchema))
    query: z.output<typeof deleteBoxQuerySchema>,
  ): Promise<void> {
    await this.lifecycle.remove(me.userId, boxId, query.confirmName);
  }

  @Get(':boxId/members')
  public listMembers(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.queries.members(me.userId, boxId, query);
  }

  // Declared before `members/:userId` so "me" is never read as a user ID.
  @Delete(':boxId/members/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimitExempt(
    'A member can leave a Box once; rejoining needs a new invitation.',
  )
  public async leave(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
  ): Promise<void> {
    await this.members.leave(me.userId, boxId);
  }

  @Patch(':boxId/members/:userId')
  @RateLimit({ scope: 'box-member-update', limit: 120, windowSeconds: hour })
  public async changeRole(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Param('userId', uuidParam) userId: string,
    @Body(new ZodPipe(updateBoxMemberSchema))
    body: z.output<typeof updateBoxMemberSchema>,
  ) {
    return {
      role: await this.members.changeRole(me.userId, boxId, userId, body.role),
    };
  }

  @Delete(':boxId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ scope: 'box-member-remove', limit: 120, windowSeconds: hour })
  public async removeMember(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Param('userId', uuidParam) userId: string,
  ): Promise<void> {
    await this.members.remove(me.userId, boxId, userId);
  }

  @Put(':boxId/owner')
  @RateLimit({ scope: 'box-transfer', limit: 20, windowSeconds: hour })
  public transfer(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Body(new ZodPipe(transferBoxOwnershipSchema))
    body: z.output<typeof transferBoxOwnershipSchema>,
  ) {
    return this.members.transferOwnership(
      me.userId,
      boxId,
      body.userId.toLowerCase(),
    );
  }

  @Post(':boxId/invitations')
  @RateLimit({ scope: 'box-invite', limit: 60, windowSeconds: hour })
  public invite(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Body(new ZodPipe(createBoxInvitationSchema))
    body: z.output<typeof createBoxInvitationSchema>,
  ) {
    return this.invitations.invite(me.userId, boxId, body.username);
  }

  @Get(':boxId/invitations')
  public listInvitations(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.invitations.listForBox(me.userId, boxId, query);
  }

  @Delete(':boxId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimitExempt('Bounded by the invitations a manager has already sent.')
  public async revokeInvitation(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Param('invitationId', uuidParam) invitationId: string,
  ): Promise<void> {
    await this.invitations.revoke(me.userId, boxId, invitationId);
  }
}

/** The invitee's side: answering invitations they received. */
@Controller()
export class BoxInvitationsController {
  public constructor(
    @Inject(BoxInvitationService)
    private readonly invitations: BoxInvitationService,
  ) {}

  @Get('me/box-invitations')
  public mine(
    @CurrentPrincipal() me: Principal,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.invitations.listMine(me.userId, query);
  }

  @Post('box-invitations/:invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @RateLimitExempt('Bounded by the invitations the person has received.')
  public accept(
    @CurrentPrincipal() me: Principal,
    @Param('invitationId', uuidParam) invitationId: string,
  ) {
    return this.invitations.accept(me.userId, invitationId);
  }

  @Post('box-invitations/:invitationId/decline')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimitExempt('Bounded by the invitations the person has received.')
  public async decline(
    @CurrentPrincipal() me: Principal,
    @Param('invitationId', uuidParam) invitationId: string,
  ): Promise<void> {
    await this.invitations.decline(me.userId, invitationId);
  }
}
