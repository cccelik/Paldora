import { Module } from '@nestjs/common';
import { IdentityModule } from './identity/identity.module.js';
import { MediaModule } from './media/media.module.js';
import { PlatformModule } from './platform/platform.module.js';

/**
 * Composition root. Each product phase adds one feature module here
 * (identity, social, boxes, posts, media, interactions, life-updates,
 * memories, rooms, realtime); feature modules never import each other's
 * internals, only exported services.
 */
@Module({
  imports: [PlatformModule, IdentityModule, MediaModule],
})
export class AppModule {}
