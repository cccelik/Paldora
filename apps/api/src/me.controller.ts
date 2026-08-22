import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { MediaAssetId } from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import {
  createAvatarUploadSchema,
  updateProfileSchema,
  usernameAvailabilitySchema,
} from '@paldora/validation';
import { ZodError } from 'zod';
import { ApiError } from './api-error.js';
import { AvatarService } from './avatar.service.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';
import { UserService } from './user.service.js';

@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class MeController {
  public constructor(
    @Inject(UserService)
    private readonly users: UserService,
    @Inject(AvatarService)
    private readonly avatars: AvatarService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Get()
  public getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.users.getCurrentUser(request.principal.userId, this.storage);
  }

  @Post('username/availability')
  public checkUsername(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = this.parse(usernameAvailabilitySchema, body);
    return this.users.checkUsername(request.principal.userId, input.username);
  }

  @Patch('profile')
  public updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = this.parse(updateProfileSchema, body);
    return this.users.updateProfile(
      request.principal.userId,
      input,
      this.storage,
    );
  }

  @Post('avatar/uploads')
  public createAvatarUpload(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = this.parse(createAvatarUploadSchema, body);
    return this.avatars.createUpload(request.principal.userId, input);
  }

  @Post('avatar/uploads/:id/complete')
  public completeAvatarUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') mediaAssetId: string,
  ) {
    return this.avatars.completeUpload(
      request.principal.userId,
      mediaAssetId as MediaAssetId,
    );
  }

  @Delete('avatar')
  public deleteAvatar(@Req() request: AuthenticatedRequest) {
    return this.avatars.deleteAvatar(request.principal.userId);
  }

  private parse<Output>(
    schema: { parse: (value: unknown) => Output },
    body: unknown,
  ): Output {
    try {
      return schema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_FAILED',
          error.issues[0]?.message ?? 'The request is invalid.',
        );
      }
      throw error;
    }
  }
}
