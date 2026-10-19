import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { BoxInvitationService } from './box-invitation.service.js';
import { BoxLifecycleService } from './box-lifecycle.service.js';
import { BoxMemberService } from './box-member.service.js';
import { BoxPolicyService } from './box-policy.service.js';
import { BoxQueryService } from './box-query.service.js';
import {
  BoxInvitationsController,
  BoxesController,
} from './boxes.controller.js';

/**
 * Private circles: lifecycle, members and roles, invitations. Every route
 * starts at `BoxPolicyService`, so non-members always see BOX_NOT_FOUND.
 */
@Module({
  imports: [IdentityModule],
  controllers: [BoxesController, BoxInvitationsController],
  providers: [
    BoxPolicyService,
    BoxQueryService,
    BoxLifecycleService,
    BoxMemberService,
    BoxInvitationService,
  ],
  // Blocking withdraws pending invitations between two people.
  exports: [BoxInvitationService],
})
export class BoxesModule {}
