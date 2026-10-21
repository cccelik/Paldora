import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  postReactionsQuerySchema,
  setCommentReactionSchema,
  setPostReactionSchema,
} from '@paldora/validation';
import type { z } from 'zod';
import {
  HOUR,
  type Principal,
} from '../../platform/http/controller-support.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../../platform/http/uuid-param.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { CommentReactionService } from './comment-reaction.service.js';
import { PostReactionService } from './post-reaction.service.js';
import { ReactionQueryService } from './reaction-query.service.js';

/** One scope for post and comment reactions: 1,000 per person per hour. */
const reactionLimit = {
  scope: 'reaction-set',
  limit: 1_000,
  windowSeconds: HOUR,
} as const;

@Controller()
export class ReactionsController {
  public constructor(
    @Inject(PostReactionService) private readonly posts: PostReactionService,
    @Inject(CommentReactionService)
    private readonly comments: CommentReactionService,
    @Inject(ReactionQueryService)
    private readonly queries: ReactionQueryService,
  ) {}

  @Put('posts/:postId/reaction')
  @RateLimit(reactionLimit)
  public setOnPost(
    @CurrentPrincipal() me: Principal,
    @Param('postId', uuidParam) postId: string,
    @Body(new ZodPipe(setPostReactionSchema))
    body: z.output<typeof setPostReactionSchema>,
  ) {
    return this.posts.set(me.userId, postId, body);
  }

  @Put('comments/:commentId/reaction')
  @RateLimit(reactionLimit)
  public setOnComment(
    @CurrentPrincipal() me: Principal,
    @Param('commentId', uuidParam) commentId: string,
    @Body(new ZodPipe(setCommentReactionSchema))
    body: z.output<typeof setCommentReactionSchema>,
  ) {
    return this.comments.set(me.userId, commentId, body.kind);
  }

  @Get('posts/:postId/reactions')
  public list(
    @CurrentPrincipal() me: Principal,
    @Param('postId', uuidParam) postId: string,
    @Query(new ZodPipe(postReactionsQuerySchema))
    query: z.output<typeof postReactionsQuerySchema>,
  ) {
    return this.queries.list(me.userId, postId, query);
  }
}
