import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { MediaAssetId, PostId } from '@paldora/domain';
import { createReactionPhotoUploadSchema } from '@paldora/validation';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { ReactionMediaService } from './reaction-media.service.js';
import { parseRequest, parseUuid } from './request-validation.js';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class ReactionMediaController {
  public constructor(
    @Inject(ReactionMediaService)
    private readonly reactionMedia: ReactionMediaService,
    @Inject(RateLimitService)
    private readonly rateLimits: RateLimitService,
  ) {}

  @Post('posts/:postId/reaction-media/uploads')
  public async createUpload(
    @Req() request: AuthenticatedRequest,
    @Param('postId') rawPostId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(createReactionPhotoUploadSchema, body);
    await this.rateLimits.assertReactionMediaUploadAllowed(
      request.principal.userId,
    );
    return this.reactionMedia.createUpload(
      request.principal.userId,
      parseUuid<PostId>(rawPostId),
      input,
    );
  }

  @Post('reaction-media/uploads/:id/complete')
  public completeUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') rawMediaAssetId: string,
  ) {
    return this.reactionMedia.completeUpload(
      request.principal.userId,
      parseUuid<MediaAssetId>(rawMediaAssetId),
    );
  }

  @Delete('reaction-media/uploads/:id')
  public cancelUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') rawMediaAssetId: string,
  ) {
    return this.reactionMedia.cancelUpload(
      request.principal.userId,
      parseUuid<MediaAssetId>(rawMediaAssetId),
    );
  }
}
