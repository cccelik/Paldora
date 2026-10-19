import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaModule } from '../media/media.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { NotificationQueryService } from './notification-query.service.js';
import { NotificationService } from './notification.service.js';
import { NotificationsController } from './notifications.controller.js';

/**
 * Reading and marking notifications. The worker's projector creates them
 * from the interactions outbox; this module never writes one, and rechecks
 * visibility on every read.
 */
@Module({
  imports: [IdentityModule, MediaModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationQueryService, NotificationService],
})
export class NotificationsModule {}
