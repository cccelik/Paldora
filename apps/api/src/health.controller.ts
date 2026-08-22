import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HealthStatus } from '@paldora/domain';
import { InfrastructureService } from './infrastructure.service.js';

@Controller('health')
export class HealthController {
  public constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}

  @Get()
  public live(): HealthStatus {
    return {
      status: 'ok',
      service: 'api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  public async ready(): Promise<{
    status: 'ready';
    dependencies: readonly ['postgres', 'redis'];
  }> {
    const ready = await this.infrastructure.check();
    if (!ready)
      throw new ServiceUnavailableException(
        'Required infrastructure is unavailable.',
      );
    return { status: 'ready', dependencies: ['postgres', 'redis'] };
  }
}
