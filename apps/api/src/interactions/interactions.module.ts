import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaModule } from '../media/media.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CommentQueryService } from './comments/comment-query.service.js';
import { CommentReactionService } from './reactions/comment-reaction.service.js';
import { CommentService } from './comments/comment.service.js';
import { CommentsController } from './comments/comments.controller.js';
import { InteractionPolicyService } from './shared/interaction-policy.service.js';
import { InteractionSummaryService } from './shared/interaction-summary.service.js';
import { PostReactionService } from './reactions/post-reaction.service.js';
import { ReactionQueryService } from './reactions/reaction-query.service.js';
import { ReactionsController } from './reactions/reactions.controller.js';

/**
 * Comments and reactions on posts. Access always starts from the post's
 * context (`posts/post-context.ts`), a plain function, so this module never
 * imports PostsModule; PostsModule imports this one for feed summaries.
 */
@Module({
  imports: [IdentityModule, MediaModule, RealtimeModule],
  controllers: [CommentsController, ReactionsController],
  providers: [
    InteractionPolicyService,
    InteractionSummaryService,
    CommentService,
    CommentQueryService,
    PostReactionService,
    CommentReactionService,
    ReactionQueryService,
  ],
  exports: [InteractionSummaryService, InteractionPolicyService],
})
export class InteractionsModule {}
