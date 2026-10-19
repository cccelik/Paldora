import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaModule } from '../media/media.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CommentQueryService } from './comment-query.service.js';
import { CommentService } from './comment.service.js';
import { CommentsController } from './comments.controller.js';
import { InteractionPolicyService } from './interaction-policy.service.js';
import { InteractionSummaryService } from './interaction-summary.service.js';

/**
 * Comments and reactions on posts. Access always starts from the post's
 * context (`posts/post-context.ts`), a plain function, so this module never
 * imports PostsModule; PostsModule imports this one for feed summaries.
 */
@Module({
  imports: [IdentityModule, MediaModule, RealtimeModule],
  controllers: [CommentsController],
  providers: [
    InteractionPolicyService,
    InteractionSummaryService,
    CommentService,
    CommentQueryService,
  ],
  exports: [InteractionSummaryService],
})
export class InteractionsModule {}
