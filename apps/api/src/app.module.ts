import { Module } from '@nestjs/common';
import { BoxesModule } from './boxes/boxes.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { InteractionsModule } from './interactions/interactions.module.js';
import { LifeUpdatesModule } from './life-updates/life-updates.module.js';
import { MediaModule } from './media/media.module.js';
import { MemoriesModule } from './memories/memories.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { SocialModule } from './social/social.module.js';
import { ModerationModule } from './moderation/moderation.module.js';
import { AccountLifecycleModule } from './account-lifecycle/account-lifecycle.module.js';

/**
 * Composition root. Each product phase adds one feature module here
 * (identity, social, boxes, posts, media, interactions, life-updates,
 * memories, rooms, realtime); feature modules never import each other's
 * internals, only exported services.
 */
@Module({
  imports: [
    PlatformModule,
    IdentityModule,
    MediaModule,
    SocialModule,
    BoxesModule,
    PostsModule,
    InteractionsModule,
    NotificationsModule,
    RealtimeModule,
    LifeUpdatesModule,
    MemoriesModule,
    RoomsModule,
    ModerationModule,
    AccountLifecycleModule,
  ],
})
export class AppModule {}
