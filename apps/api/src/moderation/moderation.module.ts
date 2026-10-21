import { Module } from '@nestjs/common';
import { BoxesModule } from '../boxes/boxes.module.js';
import { InteractionsModule } from '../interactions/interactions.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportService } from './report.service.js';

@Module({
  imports: [BoxesModule, InteractionsModule],
  controllers: [ReportsController],
  providers: [ReportService],
})
export class ModerationModule {}
