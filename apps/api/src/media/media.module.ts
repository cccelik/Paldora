import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { MediaUploadService } from './media-upload.service.js';
import { MediaUrlService } from './media-urls.service.js';

/**
 * Uploads for every purpose, through one policy table (R4). Processing and
 * deletion run in the worker from `media_job_outbox`; this module only
 * reserves, verifies, queues, and signs reads.
 */
@Module({
  controllers: [MediaController],
  providers: [MediaUploadService, MediaUrlService],
  exports: [MediaUrlService],
})
export class MediaModule {}
