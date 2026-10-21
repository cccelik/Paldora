import { Module } from '@nestjs/common';
import { AccountExportsController } from './account-exports.controller.js';
import { AccountExportsService } from './account-exports.service.js';

@Module({
  controllers: [AccountExportsController],
  providers: [AccountExportsService],
})
export class AccountLifecycleModule {}
