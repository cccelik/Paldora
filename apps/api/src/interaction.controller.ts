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
  Put,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type {
  CommentId,
  MediaAssetId,
  NotificationId,
  PostId,
} from '@paldora/domain';
import {
  createCommentSchema,
  cursorPageSchema,
  setPostReactionSchema,
  setCommentReactionSchema,
  updateCommentSchema,
} from '@paldora/validation';
import { Observable } from 'rxjs';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { InteractionAuthorizationPolicy } from './interaction-authorization-policy.service.js';
import { InteractionService } from './interaction.service.js';
import { NotificationService } from './notification.service.js';
import { PostEventService } from './post-event.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { parseRequest, parseUuid } from './request-validation.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class InteractionController {
  public constructor(
    @Inject(InteractionService)
    private readonly interactions: InteractionService,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
    @Inject(InteractionAuthorizationPolicy)
    private readonly policy: InteractionAuthorizationPolicy,
    @Inject(PostEventService)
    private readonly events: PostEventService,
    @Inject(RateLimitService)
    private readonly rateLimits: RateLimitService,
  ) {}

  @Get('posts/:postId/comments')
  public listComments(
    @Req() request: AuthenticatedRequest,
    @Param('postId') rawPostId: string,
    @Query() query: unknown,
  ) {
    return this.interactions.listComments(
      request.principal.userId,
      parseUuid<PostId>(rawPostId),
      parseRequest(cursorPageSchema, query),
    );
  }

  @Post('posts/:postId/comments')
  public async createComment(
    @Req() request: AuthenticatedRequest,
    @Param('postId') rawPostId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(createCommentSchema, body);
    await this.rateLimits.assertCommentAllowed(request.principal.userId);
    return this.interactions.createComment(
      request.principal.userId,
      parseUuid<PostId>(rawPostId),
      input.content,
      input.parentCommentId as CommentId | undefined,
    );
  }

  @Patch('comments/:commentId')
  public updateComment(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') rawCommentId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(updateCommentSchema, body);
    return this.interactions.updateComment(
      request.principal.userId,
      parseUuid<CommentId>(rawCommentId),
      input.content,
    );
  }

  @Delete('comments/:commentId')
  public deleteComment(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') rawCommentId: string,
  ) {
    return this.interactions.deleteComment(
      request.principal.userId,
      parseUuid<CommentId>(rawCommentId),
    );
  }

  @Put('posts/:postId/reaction')
  public async setReaction(
    @Req() request: AuthenticatedRequest,
    @Param('postId') rawPostId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(setPostReactionSchema, body);
    await this.rateLimits.assertReactionAllowed(request.principal.userId);
    return this.interactions.setReaction(
      request.principal.userId,
      parseUuid<PostId>(rawPostId),
      input.kind,
      input.mediaAssetId
        ? parseUuid<MediaAssetId>(input.mediaAssetId)
        : undefined,
    );
  }

  @Put('comments/:commentId/reaction')
  public async setCommentReaction(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') rawCommentId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(setCommentReactionSchema, body);
    await this.rateLimits.assertReactionAllowed(request.principal.userId);
    return this.interactions.setCommentReaction(
      request.principal.userId,
      parseUuid<CommentId>(rawCommentId),
      input.kind,
    );
  }

  @Get('me/notifications')
  public listNotifications(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
  ) {
    return this.notifications.list(
      request.principal.userId,
      parseRequest(cursorPageSchema, query),
    );
  }

  @Get('me/notifications/unread-count')
  public unreadCount(@Req() request: AuthenticatedRequest) {
    return this.notifications.unreadCount(request.principal.userId);
  }

  @Patch('me/notifications/read')
  public markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.principal.userId);
  }

  @Patch('me/notifications/:notificationId/read')
  public markRead(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId') rawNotificationId: string,
  ) {
    return this.notifications.markRead(
      request.principal.userId,
      parseUuid<NotificationId>(rawNotificationId),
    );
  }

  @Sse('me/notifications/events')
  @Header('X-Accel-Buffering', 'no')
  public notificationEvents(
    @Req() request: AuthenticatedRequest,
  ): Observable<MessageEvent> {
    const userId = request.principal.userId;
    return new Observable<MessageEvent>((subscriber) => {
      let active = true;
      let unsubscribe: (() => void) | undefined;
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'heartbeat', data: { at: Date.now() } });
      }, 20_000);
      void this.events
        .subscribeInteractions((event) => {
          if (!active || event.recipientUserId !== userId) return;
          void this.policy
            .requireVisiblePost(userId, event.postId)
            .then(() => {
              if (active) {
                subscriber.next({
                  id: event.id,
                  type: event.action,
                  data: event,
                });
              }
            })
            .catch(() => undefined);
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
}
