import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import { cursorPageQuerySchema } from '@paldora/validation';
import type { z } from 'zod';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { uuidParam } from '../platform/uuid-param.js';
import { ZodPipe } from '../platform/zod.pipe.js';
import { NotificationQueryService } from './notification-query.service.js';
import { NotificationService } from './notification.service.js';

type Principal = AuthenticatedPrincipal;

/** Mark one and mark all share one scope: 600 per person per hour. */
const readLimit = {
  scope: 'notification-read',
  limit: 600,
  windowSeconds: 3_600,
} as const;

@Controller('me/notifications')
export class NotificationsController {
  public constructor(
    @Inject(NotificationQueryService)
    private readonly queries: NotificationQueryService,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  public list(
    @CurrentPrincipal() me: Principal,
    @Query(new ZodPipe(cursorPageQuerySchema))
    query: z.output<typeof cursorPageQuerySchema>,
  ) {
    return this.queries.list(me.userId, query);
  }

  @Get('unread-count')
  public unreadCount(@CurrentPrincipal() me: Principal) {
    return this.queries.unreadCount(me.userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(readLimit)
  public async markAllRead(@CurrentPrincipal() me: Principal): Promise<void> {
    await this.notifications.markAllRead(me.userId);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(readLimit)
  public async markRead(
    @CurrentPrincipal() me: Principal,
    @Param('notificationId', uuidParam) notificationId: string,
  ): Promise<void> {
    await this.notifications.markRead(me.userId, notificationId);
  }
}
