import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { InteractionsModule } from '../interactions/interactions.module.js';
import { MediaModule } from '../media/media.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { LifeUpdateDeleteService } from './life-update-delete.service.js';
import { LifeUpdatePolicyService } from './life-update-policy.service.js';
import { LifeUpdatePublishService } from './life-update-publish.service.js';
import { LifeUpdateQueryService } from './life-update-query.service.js';
import { LifeUpdateViewService } from './life-update-view.service.js';
import { LifeUpdatesController } from './life-updates.controller.js';

/**
 * Life Updates (Phase 6): stored once, delivered per Box through backing
 * posts, so Phase 5 interactions work on each delivery unchanged. Never
 * imports PostsModule (PostsModule may import this one for feeds), so there
 * is no cycle.
 */
@Module({
  imports: [IdentityModule, MediaModule, RealtimeModule, InteractionsModule],
  controllers: [LifeUpdatesController],
  providers: [
    LifeUpdatePolicyService,
    LifeUpdateViewService,
    LifeUpdatePublishService,
    LifeUpdateDeleteService,
    LifeUpdateQueryService,
  ],
  exports: [LifeUpdateViewService, LifeUpdatePolicyService],
})
export class LifeUpdatesModule {}
