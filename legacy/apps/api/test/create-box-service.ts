import { BoxAuthorizationPolicy } from '../src/box-authorization-policy.service.js';
import { BoxInvitationService } from '../src/box-invitation.service.js';
import { BoxLifecycleService } from '../src/box-lifecycle.service.js';
import { BoxMembershipService } from '../src/box-membership.service.js';
import { BoxQueryService } from '../src/box-query.service.js';
import { BoxService } from '../src/box.service.js';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import type { ProfileAvatarService } from '../src/profile-avatar.service.js';

export function createBoxService(
  infrastructure: InfrastructureService,
  avatars: ProfileAvatarService,
): BoxService {
  const policy = new BoxAuthorizationPolicy(infrastructure);
  return new BoxService(
    new BoxQueryService(infrastructure, avatars, policy),
    new BoxLifecycleService(infrastructure, policy),
    new BoxInvitationService(infrastructure, policy),
    new BoxMembershipService(infrastructure, policy),
  );
}
