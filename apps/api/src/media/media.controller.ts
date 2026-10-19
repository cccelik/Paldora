import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import type { AuthenticatedPrincipal, MediaAssetId } from '@paldora/domain';
import {
  createMediaUploadSchema,
  uuidSchema,
  type CreateMediaUploadInput,
} from '@paldora/validation';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { ZodPipe } from '../platform/zod.pipe.js';
import { MediaUploadService } from './media-upload.service.js';

const mediaAssetIdPipe = new ZodPipe(uuidSchema);

@Controller('media')
export class MediaController {
  public constructor(
    @Inject(MediaUploadService) private readonly uploads: MediaUploadService,
  ) {}

  @Post('uploads')
  @RateLimit({ scope: 'media-upload', limit: 480, windowSeconds: 3_600 })
  public create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodPipe(createMediaUploadSchema)) body: CreateMediaUploadInput,
  ) {
    return this.uploads.create(principal.userId, body);
  }

  @Post('uploads/:mediaAssetId/complete')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    scope: 'media-upload-complete',
    limit: 480,
    windowSeconds: 3_600,
  })
  public complete(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('mediaAssetId', mediaAssetIdPipe) mediaAssetId: string,
  ) {
    return this.uploads.complete(
      principal.userId,
      mediaAssetId as MediaAssetId,
    );
  }

  @Get(':mediaAssetId')
  public get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('mediaAssetId', mediaAssetIdPipe) mediaAssetId: string,
  ) {
    return this.uploads.get(principal.userId, mediaAssetId as MediaAssetId);
  }
}
