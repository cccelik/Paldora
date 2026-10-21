import { Module } from '@nestjs/common';
import { AccountExportsController } from './account-exports.controller.js';
import { AccountExportsService } from './account-exports.service.js';
import { AccountDeletionController } from './account-deletion.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { PASSWORD_REAUTHENTICATOR } from '../platform/config/tokens.js';
import { SupabasePasswordReauthenticator } from './password-reauthenticator.js';

@Module({
  controllers: [AccountExportsController, AccountDeletionController],
  providers: [
    AccountExportsService,
    AccountDeletionService,
    {
      provide: PASSWORD_REAUTHENTICATOR,
      useClass: SupabasePasswordReauthenticator,
    },
  ],
})
export class AccountLifecycleModule {}
