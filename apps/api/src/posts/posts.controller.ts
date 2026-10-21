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
import { createPostSchema, updatePostSchema } from '@paldora/validation';
import type { z } from 'zod';
import {
  cursorPageQuery,
  HOUR,
  type PageQuery,
  type Principal,
} from '../platform/http/controller-support.js';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../platform/http/uuid-param.js';
import { ZodPipe } from '../platform/http/zod.pipe.js';
import { PostQueryService } from './post-query.service.js';
import { PostService } from './post.service.js';
import { toPostView } from './post-views.js';

@Controller()
export class PostsController {
  public constructor(
    @Inject(PostService) private readonly posts: PostService,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
  ) {}

  @Post('boxes/:boxId/posts')
  @RateLimit({ scope: 'post-create', limit: 120, windowSeconds: HOUR })
  public create(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Body(new ZodPipe(createPostSchema))
    body: z.output<typeof createPostSchema>,
  ) {
    return this.posts.create(me.userId, boxId, body);
  }

  @Get('boxes/:boxId/posts')
  public boxFeed(
    @CurrentPrincipal() me: Principal,
    @Param('boxId', uuidParam) boxId: string,
    @Query(cursorPageQuery) query: PageQuery,
  ) {
    return this.queries.boxFeed(me.userId, boxId, query);
  }

  @Get('me/feed')
  public homeFeed(
    @CurrentPrincipal() me: Principal,
    @Query(cursorPageQuery) query: PageQuery,
  ) {
    return this.queries.homeFeed(me.userId, query);
  }

  @Get('posts/:postId')
  public async get(
    @CurrentPrincipal() me: Principal,
    @Param('postId', uuidParam) postId: string,
  ) {
    const { context, author, media, interactions } = await this.queries.get(
      me.userId,
      postId,
    );
    return toPostView(context, author, me.userId, media, interactions);
  }

  @Patch('posts/:postId')
  @RateLimit({ scope: 'post-update', limit: 120, windowSeconds: HOUR })
  public update(
    @CurrentPrincipal() me: Principal,
    @Param('postId', uuidParam) postId: string,
    @Body(new ZodPipe(updatePostSchema))
    body: z.output<typeof updatePostSchema>,
  ) {
    return this.posts.update(me.userId, postId, body.content);
  }

  @Delete('posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ scope: 'post-delete', limit: 60, windowSeconds: HOUR })
  public async remove(
    @CurrentPrincipal() me: Principal,
    @Param('postId', uuidParam) postId: string,
  ): Promise<void> {
    await this.posts.remove(me.userId, postId);
  }
}
