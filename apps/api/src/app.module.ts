import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { InfrastructureService } from './infrastructure.service.js';

@Module({
  controllers: [HealthController],
  providers: [InfrastructureService],
})
export class AppModule {}
