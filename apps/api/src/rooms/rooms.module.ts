import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaModule } from '../media/media.module.js';
import { RoomAccessService } from './room-access.service.js';
import { RoomTopFriendsService } from './room-top-friends.service.js';
import { RoomUpdateService } from './room-update.service.js';
import { RoomViewService } from './room-view.service.js';
import { RoomWidgetService } from './room-widget.service.js';
import { RoomWriteService } from './room-write.service.js';
import { RoomsController } from './rooms.controller.js';

/**
 * Rooms (Phase 7, ADR 017): a person's customizable profile. Every route
 * starts at RoomAccessService, the only place a Room's audience is decided.
 * It does not import SocialModule or BoxesModule: Top Friends removal on
 * unfriend and block lives in database triggers, so those services need no
 * Room code. Nothing imports this module.
 */
@Module({
  imports: [IdentityModule, MediaModule],
  controllers: [RoomsController],
  providers: [
    RoomAccessService,
    RoomViewService,
    RoomWriteService,
    RoomUpdateService,
    RoomWidgetService,
    RoomTopFriendsService,
  ],
})
export class RoomsModule {}
