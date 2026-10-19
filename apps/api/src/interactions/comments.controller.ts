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
  Query,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  createCommentSchema,
  cursorPageQuerySchema,
  updateCommentSchema,
} from '@paldora/validation';
import type { z } from 'zod';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../platform/uuid-param.js';
import { ZodPipe } from '../platform/zod.pipe.js';
import { CommentQueryService } from './comment-query.service.js';
import { CommentService } from './comment.service.js';

type Principal = AuthenticatedPrincipal;
type PageQuery = z.output<typeof cursorPageQuerySchema>;
const pageQuery = new ZodPipe(cursorPageQuerySchema);
const hour = 3_600;

@Controller()
export class CommentsController {
  public constructor(
    @Inject(CommentService) private readonly comments: CommentService,
    @Inject(CommentQueryService) private readonly queries: CommentQueryService,
  ) {}

  @Post('posts/:postId/comments')
  @RateLimit({ scope: 'comment-create', limit: 300, windowSeconds: hour })
  public create(
    @CurrentPrincipal() me: Principal,
    @Param('postId', uuidParam) postId: string,
    @Body(new ZodPipe(createCommentSchema))
    body: z.output<typeof createCommentSchema>,
  ) {
    return this.comments.create(me.userId, postId, body);
  }

  @Get('posts/:postId/comments')
  public list(
    @CurrentPrincipal() me: Principal,
    @Param('postId', uuidParam) postId: string,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.queries.roots(me.userId, postId, query);
  }

  @Get('comments/:commentId/replies')
  public replies(
    @CurrentPrincipal() me: Principal,
    @Param('commentId', uuidParam) commentId: string,
    @Query(pageQuery) query: PageQuery,
  ) {
    return this.queries.replies(me.userId, commentId, query);
  }

  @Get('comments/:commentId')
  public get(
    @CurrentPrincipal() me: Principal,
    @Param('commentId', uuidParam) commentId: string,
  ) {
    return this.queries.detail(me.userId, commentId);
  }

  @Patch('comments/:commentId')
  @RateLimit({ scope: 'comment-update', limit: 300, windowSeconds: hour })
  public update(
    @CurrentPrincipal() me: Principal,
    @Param('commentId', uuidParam) commentId: string,
    @Body(new ZodPipe(updateCommentSchema))
    body: z.output<typeof updateCommentSchema>,
  ) {
    return this.comments.update(me.userId, commentId, body.content);
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ scope: 'comment-delete', limit: 300, windowSeconds: hour })
  public async remove(
    @CurrentPrincipal() me: Principal,
    @Param('commentId', uuidParam) commentId: string,
  ): Promise<void> {
    await this.comments.remove(me.userId, commentId);
  }
}
