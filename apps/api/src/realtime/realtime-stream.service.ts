import {
  HttpStatus,
  Inject,
  Injectable,
  type MessageEvent,
} from '@nestjs/common';
import { boxMemberships, users, type PaldoraDatabase } from '@paldora/database';
import type { AuthenticatedPrincipal } from '@paldora/domain';
import type { Logger } from '@paldora/observability';
import type { RealtimeEvent } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { Observable } from 'rxjs';
import { ApiError } from '../platform/http/api-error.js';
import { DATABASE, LOGGER } from '../platform/config/tokens.js';
import { boxChannel, RealtimeBus, userChannel } from './realtime-bus.js';

export const MAX_STREAMS_PER_USER = 5;
export const HEARTBEAT_MS = 25_000;
/** setTimeout cannot exceed a signed 32-bit millisecond count. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * One open stream. It subscribes to the person's `user:` channel and to the
 * channel of every Box they currently belong to. When a membership changes
 * the server recomputes that set, so a removed member stops receiving that
 * Box's events and a new member starts. Account status is rechecked before
 * every event and heartbeat so suspension closes an existing connection.
 */
class Stream {
  private readonly boxUnsubscribers = new Map<string, () => void>();
  private unsubscribeUser: (() => void) | undefined;
  private unsubscribeDown: (() => void) | undefined;
  private timers: NodeJS.Timeout[] = [];
  private closed = false;

  public constructor(
    private readonly principal: AuthenticatedPrincipal,
    private readonly bus: RealtimeBus,
    private readonly loadBoxIds: () => Promise<string[]>,
    private readonly isActive: () => Promise<boolean>,
    private readonly sink: {
      next(event: MessageEvent): void;
      complete(): void;
    },
  ) {}

  public async start(): Promise<void> {
    const userId = this.principal.userId;
    // Subscribe to membership changes before reading memberships, so a change
    // in between cannot be missed.
    this.unsubscribeUser = await this.bus.subscribe(
      userChannel(userId),
      (event) => {
        void this.recompute().then(
          () => this.authorizedSend(event),
          () => this.stop(),
        );
      },
    );
    this.unsubscribeDown = this.bus.onDown(() => this.stop());
    await this.recompute();
    if (this.closed) return;
    await this.authorizedSend({ type: 'resync', at: new Date().toISOString() });
    if (this.closed) return;
    const untilExpiry = this.principal.expiresAt.getTime() - Date.now();
    this.timers.push(
      setTimeout(
        () => this.stop(),
        Math.min(Math.max(untilExpiry, 0), MAX_TIMER_MS),
      ),
      setInterval(() => {
        void this.authorizedSend({
          type: 'ping',
          at: new Date().toISOString(),
        });
      }, HEARTBEAT_MS),
    );
  }

  public stop(): void {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    for (const unsubscribe of this.boxUnsubscribers.values()) unsubscribe();
    this.boxUnsubscribers.clear();
    this.unsubscribeUser?.();
    this.unsubscribeDown?.();
    this.sink.complete();
  }

  private send(event: RealtimeEvent): void {
    if (!this.closed) this.sink.next({ type: event.type, data: event });
  }

  private async authorizedSend(event: RealtimeEvent): Promise<void> {
    try {
      if (!(await this.isActive())) {
        this.stop();
        return;
      }
      this.send(event);
    } catch {
      this.stop();
    }
  }

  private async recompute(): Promise<void> {
    const wanted = new Set(await this.loadBoxIds());
    for (const [boxId, unsubscribe] of this.boxUnsubscribers) {
      if (wanted.has(boxId)) continue;
      unsubscribe();
      this.boxUnsubscribers.delete(boxId);
    }
    for (const boxId of wanted) {
      if (this.boxUnsubscribers.has(boxId) || this.closed) continue;
      // Sequential: each subscription is a Redis round trip on one connection.
      // eslint-disable-next-line no-await-in-loop
      const unsubscribe = await this.bus.subscribe(
        boxChannel(boxId),
        (event) => {
          void this.authorizedSend(event);
        },
      );
      this.boxUnsubscribers.set(boxId, unsubscribe);
    }
  }
}

@Injectable()
export class RealtimeStreamService {
  private readonly open = new Map<string, number>();

  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Rejects before streaming starts, so the client gets a normal error. */
  public openFor(principal: AuthenticatedPrincipal): Observable<MessageEvent> {
    if ((this.open.get(principal.userId) ?? 0) >= MAX_STREAMS_PER_USER) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many open connections. Close another tab and try again.',
        { 'Retry-After': '30' },
      );
    }
    return new Observable<MessageEvent>((subscriber) => {
      this.open.set(
        principal.userId,
        (this.open.get(principal.userId) ?? 0) + 1,
      );
      const stream = new Stream(
        principal,
        this.bus,
        () => this.activeBoxIds(principal.userId),
        () => this.isActive(principal.userId),
        subscriber,
      );
      stream.start().catch((error: unknown) => {
        this.logger.warn({ err: error }, 'realtime stream failed to start');
        stream.stop();
      });
      return () => {
        stream.stop();
        const remaining = (this.open.get(principal.userId) ?? 1) - 1;
        if (remaining <= 0) this.open.delete(principal.userId);
        else this.open.set(principal.userId, remaining);
      };
    });
  }

  private async activeBoxIds(userId: string): Promise<string[]> {
    const rows = await this.database
      .select({ boxId: boxMemberships.boxId })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    return rows.map((row) => row.boxId);
  }

  private async isActive(userId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.status === 'active';
  }
}
