import { Module } from '@nestjs/common';
import { BoxesModule } from './boxes/boxes.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { MediaModule } from './media/media.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { SocialModule } from './social/social.module.js';

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
  ],
})
export class AppModule {}
