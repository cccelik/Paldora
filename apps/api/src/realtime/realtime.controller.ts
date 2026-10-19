import {
  Controller,
  Header,
  Inject,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import type { Observable } from 'rxjs';
import { CurrentPrincipal } from '../platform/auth/current-principal.decorator.js';
import { RateLimit } from '../platform/rate-limit/rate-limit.decorator.js';
import { RealtimeStreamService } from './realtime-stream.service.js';

@Controller('me')
export class RealtimeController {
  public constructor(
    @Inject(RealtimeStreamService)
    private readonly streams: RealtimeStreamService,
  ) {}

  @Sse('events')
  // Proxies must not buffer a stream that sends small, infrequent chunks.
  @Header('X-Accel-Buffering', 'no')
  // Reconnects are normal (token expiry, network); the cap stops loops.
  @RateLimit({ scope: 'events-connect', limit: 120, windowSeconds: 3_600 })
  public events(
    @CurrentPrincipal() me: AuthenticatedPrincipal,
  ): Observable<MessageEvent> {
    return this.streams.openFor(me);
  }
}
