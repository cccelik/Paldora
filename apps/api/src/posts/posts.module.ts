import { Module } from '@nestjs/common';
import { BoxesModule } from '../boxes/boxes.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InteractionsModule } from '../interactions/interactions.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { MediaModule } from '../media/media.module.js';
import { PostQueryService } from './post-query.service.js';
import { PostService } from './post.service.js';
import { PostsController } from './posts.controller.js';

/** Posts with photos, chronological feeds, and each post's interaction summary. */
@Module({
  imports: [
    IdentityModule,
    BoxesModule,
    MediaModule,
    RealtimeModule,
    InteractionsModule,
  ],
  controllers: [PostsController],
  providers: [PostService, PostQueryService],
})
export class PostsModule {}
