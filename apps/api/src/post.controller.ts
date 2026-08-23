import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  type MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { BoxId, MediaAssetId, PostId } from '@paldora/domain';
import {
  createPostSchema,
  createPostMediaUploadSchema,
  cursorPageSchema,
  updatePostSchema,
} from '@paldora/validation';
import { Observable } from 'rxjs';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { PostService } from './post.service.js';
import { PostEventService } from './post-event.service.js';
import { PostMediaService } from './post-media.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { parseRequest, parseUuid } from './request-validation.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class PostController {
  public constructor(
    @Inject(PostService) private readonly posts: PostService,
    @Inject(RateLimitService) private readonly rateLimits: RateLimitService,
    @Inject(PostEventService)
    private readonly postEvents: PostEventService,
    @Inject(PostMediaService)
    private readonly postMedia: PostMediaService,
  ) {}

  @Post('boxes/:boxId/posts')
  public async create(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const input = parseRequest(createPostSchema, body);
    await this.rateLimits.assertPostAllowed(request.principal.userId);
    return this.posts.create(
      request.principal.userId,
      boxId,
      input.content,
      input.mediaAssetIds as MediaAssetId[],
    );
  }

  @Post('boxes/:boxId/post-media/uploads')
  public async createMediaUpload(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Body() body: unknown,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const input = parseRequest(createPostMediaUploadSchema, body);
    await this.rateLimits.assertPostMediaUploadAllowed(
      request.principal.userId,
    );
    return this.postMedia.createUpload(request.principal.userId, boxId, input);
  }

  @Post('post-media/uploads/:id/complete')
  public completeMediaUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') rawMediaAssetId: string,
  ) {
    const mediaAssetId = parseUuid<MediaAssetId>(rawMediaAssetId);
    return this.postMedia.completeUpload(
      request.principal.userId,
      mediaAssetId,
    );
  }

  @Delete('post-media/uploads/:id')
  public cancelMediaUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') rawMediaAssetId: string,
  ) {
    const mediaAssetId = parseUuid<MediaAssetId>(rawMediaAssetId);
    return this.postMedia.cancelUpload(request.principal.userId, mediaAssetId);
  }

  @Get('boxes/:boxId/posts')
  public listBox(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
    @Query() query: unknown,
  ) {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const input = parseRequest(cursorPageSchema, query);
    return this.posts.listBox(request.principal.userId, boxId, input);
  }

  @Sse('boxes/:boxId/posts/events')
  @Header('X-Accel-Buffering', 'no')
  public async events(
    @Req() request: AuthenticatedRequest,
    @Param('boxId') rawBoxId: string,
  ): Promise<Observable<MessageEvent>> {
    const boxId = parseUuid<BoxId>(rawBoxId);
    const userId = request.principal.userId;
    await this.posts.assertBoxAccess(userId, boxId);
    return this.eventStream(userId, boxId);
  }

  @Sse('me/feed/events')
  @Header('X-Accel-Buffering', 'no')
  public feedEvents(
    @Req() request: AuthenticatedRequest,
  ): Observable<MessageEvent> {
    return this.eventStream(request.principal.userId);
  }

  private eventStream(
    userId: AuthenticatedRequest['principal']['userId'],
    boxId?: BoxId,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let active = true;
      let unsubscribe: (() => void) | undefined;
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'heartbeat', data: { at: Date.now() } });
      }, 20_000);
      void this.postEvents
        .subscribe((event) => {
          if (!active || (boxId && event.boxId !== boxId)) return;
          void this.posts
            .canAccessBox(userId, event.boxId)
            .then((canAccess) => {
              if (active && canAccess) {
                subscriber.next({
                  id: event.id,
                  type: `post.${event.action}`,
                  data: event,
                });
              }
            })
            .catch((error: unknown) => subscriber.error(error));
        })
        .then((stop) => {
          if (active) unsubscribe = stop;
          else stop();
        })
        .catch((error: unknown) => subscriber.error(error));
      return () => {
        active = false;
        clearInterval(heartbeat);
        unsubscribe?.();
      };
    });
  }

  @Get('me/feed')
  public feed(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    const input = parseRequest(cursorPageSchema, query);
    return this.posts.feed(request.principal.userId, input);
  }

  @Get('posts/:postId')
  public get(
    @Req() request: AuthenticatedRequest,
    @Param('postId') rawPostId: string,
  ) {
    const postId = parseUuid<PostId>(rawPostId);
    return this.posts.get(request.principal.userId, postId);
  }

  @Patch('posts/:postId')
  public update(
    @Req() request: AuthenticatedRequest,
    @Param('postId') rawPostId: string,
    @Body() body: unknown,
  ) {
    const postId = parseUuid<PostId>(rawPostId);
    const input = parseRequest(updatePostSchema, body);
    return this.posts.update(request.principal.userId, postId, input.content);
  }

  @Delete('posts/:postId')
  public delete(
    @Req() request: AuthenticatedRequest,
    @Param('postId') rawPostId: string,
  ) {
    const postId = parseUuid<PostId>(rawPostId);
    return this.posts.delete(request.principal.userId, postId);
  }
}
