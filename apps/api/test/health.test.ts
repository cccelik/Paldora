import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../src/health.controller.js';
import { InfrastructureService } from '../src/infrastructure.service.js';

describe('HealthController', () => {
  it('reports liveness without disclosing infrastructure details', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: InfrastructureService, useValue: { check: vi.fn() } },
      ],
    }).compile();
    const result = module.get(HealthController).live();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
  });
});
