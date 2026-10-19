import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  AuthenticatedPrincipal,
  UserId,
  VerifiedIdentity,
} from '@paldora/domain';
import { MemoryObjectStorage } from '@paldora/storage';
import { createLogger } from '@paldora/observability';
import { errorEnvelopeSchema, livenessSchema } from '@paldora/validation';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { configureApp } from '../configure-app.js';
import { authenticationRequired } from './api-error.js';
import {
  accountBlocked,
  accountNotProvisioned,
} from './auth/principal-resolver.js';
import { Public } from './auth/public.decorator.js';
import { PlatformModule } from './platform.module.js';
import { RateLimit } from './rate-limit/rate-limit.decorator.js';
import type { RateLimiter } from './rate-limit/rate-limiter.js';
import { InfrastructureService } from './infrastructure.service.js';
import { REQUEST_CONTEXT_TEST_IDENTITY } from './testing.js';
import {
  ACCESS_TOKEN_VERIFIER,
  API_ENVIRONMENT,
  LOGGER,
  OBJECT_STORAGE,
  PRINCIPAL_RESOLVER,
  RATE_LIMITER,
} from './tokens.js';
import { ZodPipe } from './zod.pipe.js';

const webOrigin = 'http://web.test';
const logLines: string[] = [];
const logger = createLogger(
  { service: 'api', environment: 'test' },
  new Writable({
    write(chunk, _encoding, callback) {
      logLines.push(String(chunk));
      callback();
    },
  }),
);

const infrastructure = {
  ready: true,
  isReady: async () => infrastructure.ready,
};
const limiterState: { mode: 'allow' | 'deny' | 'fail' } = { mode: 'allow' };
const limiter: RateLimiter & typeof limiterState = Object.assign(limiterState, {
  consume: async () => {
    if (limiterState.mode === 'fail') throw new Error('redis down');
    return { allowed: limiterState.mode === 'allow', retryAfterSeconds: 42 };
  },
});

/** Token → subject → account state, standing in for the users table. */
const accounts: Record<string, 'active' | 'missing' | 'suspended'> = {
  'valid-token': 'active',
  'unprovisioned-token': 'missing',
  'suspended-token': 'suspended',
};

const createSchema = z.object({ name: z.string().min(1).max(10) });

@Controller('test')
class TestController {
  public constructor(@Inject(LOGGER) private readonly log: typeof logger) {}

  @Get('private')
  public private(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('explode')
  public explode(): never {
    this.log.debug('about to fail');
    throw new Error('database password is hunter2');
  }

  @Public()
  @Post('things')
  @RateLimit({ scope: 'test-things', limit: 5, windowSeconds: 60 })
  public create(
    @Body(new ZodPipe(createSchema)) body: z.output<typeof createSchema>,
  ) {
    return { created: body.name };
  }
}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [PlatformModule],
    controllers: [TestController],
  })
    .overrideProvider(API_ENVIRONMENT)
    .useValue({ WEB_ORIGIN: webOrigin, PALDORA_ENV: 'test', LOG_LEVEL: 'info' })
    .overrideProvider(LOGGER)
    .useValue(logger)
    .overrideProvider(InfrastructureService)
    .useValue(infrastructure)
    .overrideProvider(RATE_LIMITER)
    .useValue(limiter)
    .overrideProvider(ACCESS_TOKEN_VERIFIER)
    .useValue({
      verify: async (token: string): Promise<VerifiedIdentity> => {
        if (!accounts[token]) throw authenticationRequired();
        return { ...REQUEST_CONTEXT_TEST_IDENTITY, subject: token };
      },
    })
    .overrideProvider(PRINCIPAL_RESOLVER)
    .useValue({
      resolve: async (
        identity: VerifiedIdentity,
      ): Promise<AuthenticatedPrincipal> => {
        const state = accounts[identity.subject];
        if (state === 'missing') throw accountNotProvisioned();
        if (state === 'suspended') throw accountBlocked();
        return { ...identity, userId: 'user-1' as UserId };
      },
    })
    .overrideProvider(OBJECT_STORAGE)
    .useValue(new MemoryObjectStorage())
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app, { webOrigin, logger });
  await app.listen(0, '127.0.0.1');
  baseUrl = `${await app.getUrl()}/api/v1`;
});

afterAll(() => app.close());

beforeEach(() => {
  infrastructure.ready = true;
  limiter.mode = 'allow';
  logLines.length = 0;
});

async function expectEnvelope(
  response: Response,
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  const body = errorEnvelopeSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  return body;
}

describe('health', () => {
  it('serves liveness publicly with a correlation ID', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { 'x-request-id': 'client-id-1' },
    });
    expect(response.status).toBe(200);
    expect(livenessSchema.parse(await response.json()).status).toBe('ok');
    expect(response.headers.get('x-request-id')).toBe('client-id-1');
  });

  it('reports readiness failures as a 503 envelope', async () => {
    infrastructure.ready = false;
    await expectEnvelope(
      await fetch(`${baseUrl}/health/ready`),
      503,
      'SERVICE_UNAVAILABLE',
    );
  });
});

describe('global authentication', () => {
  it('denies routes without a bearer token', async () => {
    await expectEnvelope(
      await fetch(`${baseUrl}/test/private`),
      401,
      'AUTHENTICATION_REQUIRED',
    );
  });

  it('denies invalid tokens without saying why', async () => {
    const body = await expectEnvelope(
      await fetch(`${baseUrl}/test/private`, {
        headers: { authorization: 'Bearer forged' },
      }),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    expect(body.error.message).toBe('Sign in to continue.');
  });

  it('rejects verified identities that were never provisioned', async () => {
    await expectEnvelope(
      await fetch(`${baseUrl}/test/private`, {
        headers: { authorization: 'Bearer unprovisioned-token' },
      }),
      403,
      'ACCOUNT_NOT_PROVISIONED',
    );
  });

  it('rejects provisioned users who are not active', async () => {
    await expectEnvelope(
      await fetch(`${baseUrl}/test/private`, {
        headers: { authorization: 'Bearer suspended-token' },
      }),
      403,
      'ACCOUNT_BLOCKED',
    );
  });

  it('allows verified tokens', async () => {
    const response = await fetch(`${baseUrl}/test/private`, {
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(response.status).toBe(200);
  });
});

describe('error envelope', () => {
  it('maps unknown routes to NOT_FOUND', async () => {
    await expectEnvelope(await fetch(`${baseUrl}/nope`), 404, 'NOT_FOUND');
  });

  it('hides internal error details and logs them server-side', async () => {
    const response = await fetch(`${baseUrl}/test/explode`);
    const body = await expectEnvelope(response, 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toMatch(/hunter2|stack|Error:/);
    expect(logLines.join('')).toContain('unhandled API error');
  });

  it('rejects malformed JSON as VALIDATION_FAILED', async () => {
    await expectEnvelope(
      await fetch(`${baseUrl}/test/things`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"name":',
      }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('rejects oversized bodies as PAYLOAD_TOO_LARGE', async () => {
    await expectEnvelope(
      await fetch(`${baseUrl}/test/things`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(300_000) }),
      }),
      413,
      'PAYLOAD_TOO_LARGE',
    );
  });

  it('reports the failing field from the shared schema', async () => {
    const body = await expectEnvelope(
      await fetch(`${baseUrl}/test/things`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      }),
      400,
      'VALIDATION_FAILED',
    );
    expect(body.error.message).toMatch(/^name: /);
  });
});

describe('rate limiting', () => {
  const post = () =>
    fetch(`${baseUrl}/test/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ok' }),
    });

  it('allows requests within the limit', async () => {
    const response = await post();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: 'ok' });
  });

  it('returns RATE_LIMITED with Retry-After when exceeded', async () => {
    limiter.mode = 'deny';
    const response = await post();
    await expectEnvelope(response, 429, 'RATE_LIMITED');
    expect(response.headers.get('retry-after')).toBe('42');
  });

  it('fails closed when the limiter is unavailable', async () => {
    limiter.mode = 'fail';
    await expectEnvelope(await post(), 503, 'RATE_LIMIT_UNAVAILABLE');
  });
});

describe('HTTP edge', () => {
  it('allows only the exact web origin', async () => {
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { origin: webOrigin },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(webOrigin);
    const denied = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'http://evil.test' },
    });
    expect(denied.headers.get('access-control-allow-origin')).not.toBe(
      'http://evil.test',
    );
  });

  it('sends security headers and no framework fingerprint', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(response.headers.get('x-powered-by')).toBeNull();
  });

  it('logs paths without query strings', async () => {
    await fetch(`${baseUrl}/health?token=secret-value`);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    const output = logLines.join('');
    expect(output).toContain('"path":"/api/v1/health"');
    expect(output).not.toContain('secret-value');
  });
});
