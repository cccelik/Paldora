import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { InfrastructureService } from './infrastructure.service.js';
import { AvatarService } from './avatar.service.js';
import { MeController } from './me.controller.js';
import { SupabaseAuthGuard, SupabaseTokenVerifier } from './auth.service.js';
import { objectStorageProvider } from './storage.provider.js';
import { UserService } from './user.service.js';
import { BoxController, BoxInvitationController } from './box.controller.js';
import { BoxService } from './box.service.js';
import { BoxAuthorizationPolicy } from './box-authorization-policy.service.js';
import { BoxInvitationService } from './box-invitation.service.js';
import { BoxLifecycleService } from './box-lifecycle.service.js';
import { BoxMembershipService } from './box-membership.service.js';
import { BoxQueryService } from './box-query.service.js';
import { SocialController } from './social.controller.js';
import { SocialService } from './social.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { PostController } from './post.controller.js';
import { PostService } from './post.service.js';
import { PostMediaService } from './post-media.service.js';
import { MediaJobOutboxDispatcher } from './media-job-outbox-dispatcher.service.js';
import { ActivityEventDispatcher } from './activity-event-dispatcher.service.js';
import { InteractionAuthorizationPolicy } from './interaction-authorization-policy.service.js';
import { InteractionController } from './interaction.controller.js';
import { InteractionService } from './interaction.service.js';
import { NotificationService } from './notification.service.js';
import { ProfileAvatarService } from './profile-avatar.service.js';
import { PostInteractionQueryService } from './post-interaction-query.js';
import { ReactionMediaService } from './reaction-media.service.js';
import { ReactionMediaController } from './reaction-media.controller.js';
import {
  POST_EVENT_PUBLISHER,
  PostEventService,
} from './post-event.service.js';

@Module({
  controllers: [
    HealthController,
    MeController,
    BoxController,
    BoxInvitationController,
    SocialController,
    PostController,
    InteractionController,
    ReactionMediaController,
  ],
  providers: [
    InfrastructureService,
    SupabaseTokenVerifier,
    SupabaseAuthGuard,
    UserService,
    AvatarService,
    MediaJobOutboxDispatcher,
    ActivityEventDispatcher,
    BoxAuthorizationPolicy,
    BoxQueryService,
    BoxLifecycleService,
    BoxInvitationService,
    BoxMembershipService,
    BoxService,
    SocialService,
    RateLimitService,
    ProfileAvatarService,
    PostEventService,
    { provide: POST_EVENT_PUBLISHER, useExisting: PostEventService },
    PostService,
    PostMediaService,
    PostInteractionQueryService,
    ReactionMediaService,
    InteractionAuthorizationPolicy,
    InteractionService,
    NotificationService,
    objectStorageProvider,
  ],
})
export class AppModule {}
