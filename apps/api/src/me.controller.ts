import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { MediaAssetId } from '@paldora/domain';
import {
  createAvatarUploadSchema,
  updateProfileSchema,
  usernameAvailabilitySchema,
} from '@paldora/validation';
import { AvatarService } from './avatar.service.js';
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from './auth.service.js';
import { parseRequest } from './request-validation.js';
import { UserService } from './user.service.js';

@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class MeController {
  public constructor(
    @Inject(UserService)
    private readonly users: UserService,
    @Inject(AvatarService)
    private readonly avatars: AvatarService,
  ) {}

  @Get()
  public getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.users.getCurrentUser(request.principal.userId);
  }

  @Post('username/availability')
  public checkUsername(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = parseRequest(usernameAvailabilitySchema, body);
    return this.users.checkUsername(request.principal.userId, input.username);
  }

  @Patch('profile')
  public updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = parseRequest(updateProfileSchema, body);
    return this.users.updateProfile(request.principal.userId, input);
  }

  @Post('avatar/uploads')
  public createAvatarUpload(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    const input = parseRequest(createAvatarUploadSchema, body);
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
}
