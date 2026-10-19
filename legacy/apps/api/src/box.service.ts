import { Inject, Injectable } from '@nestjs/common';
import type {
  Box,
  BoxId,
  BoxInvitation,
  BoxInvitationId,
  BoxMember,
  UserId,
} from '@paldora/domain';
import { BoxInvitationService } from './box-invitation.service.js';
import { BoxLifecycleService } from './box-lifecycle.service.js';
import { BoxMembershipService } from './box-membership.service.js';
import { BoxQueryService } from './box-query.service.js';

@Injectable()
export class BoxService {
  public constructor(
    @Inject(BoxQueryService)
    private readonly queries: BoxQueryService,
    @Inject(BoxLifecycleService)
    private readonly lifecycle: BoxLifecycleService,
    @Inject(BoxInvitationService)
    private readonly invitationsService: BoxInvitationService,
    @Inject(BoxMembershipService)
    private readonly memberships: BoxMembershipService,
  ) {}

  public list(userId: UserId): Promise<Box[]> {
    return this.queries.list(userId);
  }

  public create(userId: UserId, name: string): Promise<Box> {
    return this.lifecycle.create(userId, name);
  }

  public get(userId: UserId, boxId: BoxId): Promise<Box> {
    return this.queries.get(userId, boxId);
  }

  public update(
    userId: UserId,
    boxId: BoxId,
    input: {
      name?: string | undefined;
      status?: 'active' | 'archived' | undefined;
    },
  ): Promise<Box> {
    return this.lifecycle.update(userId, boxId, input);
  }

  public deleteBox(userId: UserId, boxId: BoxId): Promise<{ success: true }> {
    return this.lifecycle.deleteBox(userId, boxId);
  }

  public members(userId: UserId, boxId: BoxId): Promise<BoxMember[]> {
    return this.queries.members(userId, boxId);
  }

  public invite(
    userId: UserId,
    boxId: BoxId,
    username: string,
  ): Promise<BoxInvitation> {
    return this.invitationsService.invite(userId, boxId, username);
  }

  public pendingInviteeIds(
    userId: UserId,
    boxId: BoxId,
  ): Promise<{ inviteeUserIds: UserId[] }> {
    return this.invitationsService.pendingInviteeIds(userId, boxId);
  }

  public invitations(userId: UserId): Promise<BoxInvitation[]> {
    return this.invitationsService.invitations(userId);
  }

  public respondToInvitation(
    userId: UserId,
    invitationId: BoxInvitationId,
    response: 'accepted' | 'declined',
  ): Promise<{ status: 'accepted' | 'declined' }> {
    return this.invitationsService.respondToInvitation(
      userId,
      invitationId,
      response,
    );
  }

  public updateMemberRole(
    userId: UserId,
    boxId: BoxId,
    memberUserId: UserId,
    role: 'admin' | 'member',
  ): Promise<{ role: 'admin' | 'member' }> {
    return this.memberships.updateMemberRole(userId, boxId, memberUserId, role);
  }

  public transferOwnership(
    userId: UserId,
    boxId: BoxId,
    newOwnerUserId: UserId,
  ): Promise<{ ownerUserId: UserId }> {
    return this.memberships.transferOwnership(userId, boxId, newOwnerUserId);
  }

  public removeMember(
    userId: UserId,
    boxId: BoxId,
    memberUserId: UserId,
  ): Promise<{ success: true; status: 'left' | 'removed' }> {
    return this.memberships.removeMember(userId, boxId, memberUserId);
  }
}
