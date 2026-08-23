import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { InfrastructureService } from './infrastructure.service.js';
import { AvatarService } from './avatar.service.js';
import { MeController } from './me.controller.js';
import { SupabaseAuthGuard, SupabaseTokenVerifier } from './auth.service.js';
import { objectStorageProvider } from './storage.provider.js';
import { UserService } from './user.service.js';
import { BoxController, BoxInvitationController } from './box.controller.js';
import { BoxService } from './box.service.js';
import { SocialController } from './social.controller.js';
import { SocialService } from './social.service.js';

@Module({
  controllers: [
    HealthController,
    MeController,
    BoxController,
    BoxInvitationController,
    SocialController,
  ],
  providers: [
    InfrastructureService,
    SupabaseTokenVerifier,
    SupabaseAuthGuard,
    UserService,
    AvatarService,
    BoxService,
    SocialService,
    objectStorageProvider,
  ],
})
export class AppModule {}
