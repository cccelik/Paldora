import { RoomPersonalizationController } from './room-personalization.controller.js';
import { RoomPersonalizationService } from './services/room-personalization.service.js';
import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaModule } from '../media/media.module.js';
import { MemoriesModule } from '../memories/memories.module.js';
import { RoomAccessService } from './services/room-access.service.js';
import { RoomContentService } from './services/room-content.service.js';
import { RoomTopFriendsService } from './services/room-top-friends.service.js';
import { RoomUpdateService } from './services/room-update.service.js';
import { RoomViewService } from './services/room-view.service.js';
import { RoomWidgetService } from './services/room-widget.service.js';
import { RoomWriteService } from './services/room-write.service.js';
import { RoomsController } from './rooms.controller.js';

/**
 * Rooms (Phase 7, ADR 017): a person's customizable profile. Every route
 * starts at RoomAccessService, the only place a Room's audience is decided.
 * It does not import SocialModule or BoxesModule: Top Friends removal on
 * unfriend and block lives in database triggers, so those services need no
 * Room code. Content previews come through MemoriesModule's page and
 * summary services, so they share its candidate query and re-authorization.
 * Nothing imports this module.
 */
@Module({
  imports: [IdentityModule, MediaModule, MemoriesModule],
  controllers: [RoomsController, RoomPersonalizationController],
  providers: [
    RoomPersonalizationService,
    RoomAccessService,
    RoomViewService,
    RoomContentService,
    RoomWriteService,
    RoomUpdateService,
    RoomWidgetService,
    RoomTopFriendsService,
  ],
})
export class RoomsModule {}
