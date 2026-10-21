import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import {
  reactionPresetsSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  usernameAvailabilityQuerySchema,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@paldora/validation';
import type { z } from 'zod';
import { HOUR } from '../platform/http/controller-support.js';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { ZodPipe } from '../platform/http/zod.pipe.js';
import { AvatarService } from './avatar.service.js';
import { CurrentUserService } from './current-user.service.js';
import { PreferencesService } from './preferences.service.js';
import { ProfileService } from './profile.service.js';

@Controller('me')
export class IdentityController {
  public constructor(
    @Inject(CurrentUserService)
    private readonly currentUser: CurrentUserService,
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(PreferencesService)
    private readonly preferences: PreferencesService,
    @Inject(AvatarService) private readonly avatars: AvatarService,
  ) {}

  @Get()
  public get(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.currentUser.load(principal.userId);
  }

  @Patch('profile')
  @RateLimit({ scope: 'profile-update', limit: 60, windowSeconds: HOUR })
  public async updateProfile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    await this.profiles.update(principal.userId, body);
    return this.currentUser.load(principal.userId);
  }

  // Rate-limited because answers reveal which usernames exist (R6).
  @Get('username-availability')
  @RateLimit({
    scope: 'username-availability',
    limit: 120,
    windowSeconds: HOUR,
  })
  public usernameAvailability(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query(new ZodPipe(usernameAvailabilityQuerySchema))
    query: z.output<typeof usernameAvailabilityQuerySchema>,
  ) {
    return this.profiles.usernameAvailability(principal.userId, query.username);
  }

  @Put('preferences')
  @RateLimit({ scope: 'preferences-update', limit: 120, windowSeconds: HOUR })
  public updatePreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodPipe(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ) {
    return this.preferences.replace(principal.userId, body);
  }

  @Put('reaction-presets')
  @RateLimit({ scope: 'reaction-presets', limit: 120, windowSeconds: HOUR })
  public setReactionPresets(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new ZodPipe(reactionPresetsSchema))
    body: z.output<typeof reactionPresetsSchema>,
  ) {
    return this.preferences.replacePresets(principal.userId, body.presets);
  }

  @Delete('avatar')
  @RateLimit({ scope: 'avatar-delete', limit: 60, windowSeconds: HOUR })
  public async deleteAvatar(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ) {
    await this.avatars.remove(principal.userId);
    return this.currentUser.load(principal.userId);
  }
}
