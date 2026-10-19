import { Module } from '@nestjs/common';
import { BoxesModule } from '../boxes/boxes.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PostQueryService } from './post-query.service.js';
import { PostService } from './post.service.js';
import { PostsController } from './posts.controller.js';

/** Text posts and chronological feeds. Photos arrive with Phase 4. */
@Module({
  imports: [IdentityModule, BoxesModule],
  controllers: [PostsController],
  providers: [PostService, PostQueryService],
})
export class PostsModule {}
