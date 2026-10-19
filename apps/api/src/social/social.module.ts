import { Module } from '@nestjs/common';
import { BoxesModule } from '../boxes/boxes.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { BlockService } from './block.service.js';
import { FriendshipService } from './friendship.service.js';
import { BlockController, FriendshipController } from './social.controller.js';

/** Friendships and blocks. Blocks follow ADR 013 (directional, hide content). */
@Module({
  imports: [IdentityModule, BoxesModule],
  controllers: [FriendshipController, BlockController],
  providers: [FriendshipService, BlockService],
})
export class SocialModule {}
