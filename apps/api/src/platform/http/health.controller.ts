import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import type { Liveness, Readiness } from '@paldora/validation';
import { ApiError } from './api-error.js';
import { Public } from '../auth/public.decorator.js';
import type { Infrastructure } from '../db/infrastructure.service.js';
import { INFRASTRUCTURE } from '../config/tokens.js';

@Controller()
export class HealthController {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
  ) {}

  @Public()
  @Get('health')
  public liveness(): Liveness {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('health/ready')
  public async readiness(): Promise<Readiness> {
    if (!(await this.infrastructure.isReady())) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE',
        'Required infrastructure is unavailable.',
      );
    }
    return { status: 'ready', dependencies: ['postgres', 'redis'] };
  }
}
