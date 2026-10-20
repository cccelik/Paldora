import { Module } from '@nestjs/common';
import { BoxesModule } from '../boxes/boxes.module.js';
import { LifeUpdatesModule } from '../life-updates/life-updates.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { MemoriesController } from './memories.controller.js';
import { MemoryQueryService } from './memory-query.service.js';
import { MemorySummaryService } from './memory-summary.service.js';

/**
 * Memories (Phase 6): a derived chronological view of the posts and Life
 * Updates a viewer can still access, by UTC year and month. Nothing is
 * stored; every request re-authorizes. Imports PostsModule and
 * LifeUpdatesModule; neither imports this one. RoomsModule imports it.
 */
@Module({
  imports: [BoxesModule, PostsModule, LifeUpdatesModule],
  controllers: [MemoriesController],
  providers: [MemoryQueryService, MemorySummaryService],
  // Rooms page and count one author's content through the same candidates.
  exports: [MemoryQueryService, MemorySummaryService],
})
export class MemoriesModule {}
