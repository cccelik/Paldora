import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { AvatarService } from './avatar.service.js';
import { CurrentUserService } from './current-user.service.js';
import { IdentityController } from './identity.controller.js';
import { PreferencesService } from './preferences.service.js';
import { ProfileSummaryService } from './profile-summary.service.js';
import { ProfileService } from './profile.service.js';
import { UserDirectoryService } from './user-directory.service.js';

/**
 * The signed-in user's own account: profile, onboarding, preferences, and
 * avatar. Token-to-user mapping lives in the platform guard, so every module
 * receives an already-resolved principal.
 */
@Module({
  imports: [MediaModule],
  controllers: [IdentityController],
  providers: [
    CurrentUserService,
    ProfileService,
    PreferencesService,
    AvatarService,
    ProfileSummaryService,
    UserDirectoryService,
  ],
  // Shared with social and boxes: people lookups never reimplement these.
  exports: [ProfileSummaryService, UserDirectoryService],
})
export class IdentityModule {}
