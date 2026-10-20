import { Module } from '@nestjs/common';
import { BoxesModule } from '../boxes/boxes.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InteractionsModule } from '../interactions/interactions.module.js';
import { LifeUpdatesModule } from '../life-updates/life-updates.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { MediaModule } from '../media/media.module.js';
import { PostPageService } from './post-page.service.js';
import { PostQueryService } from './post-query.service.js';
import { PostService } from './post.service.js';
import { PostsController } from './posts.controller.js';

/**
 * Posts with photos, chronological feeds (with Life Updates woven in), and
 * each post's interaction summary. Imports LifeUpdatesModule, never the
 * other way round.
 */
@Module({
  imports: [
    IdentityModule,
    BoxesModule,
    MediaModule,
    RealtimeModule,
    InteractionsModule,
    LifeUpdatesModule,
  ],
  controllers: [PostsController],
  providers: [PostService, PostPageService, PostQueryService],
})
export class PostsModule {}
