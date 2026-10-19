import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  profiles,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { BoxMemberView, BoxView } from '@paldora/validation';
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import {
  afterCursor,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
} from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxNotFound } from './box-errors.js';
import { BoxPolicyService } from './box-policy.service.js';
import { loadBoxView, memberCounts, toBoxView } from './box-views.js';

export interface PageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

@Injectable()
export class BoxQueryService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(ProfileSummaryService)
    private readonly summaries: ProfileSummaryService,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  /** The viewer's active Boxes, newest membership first. */
  public async list(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<BoxView>> {
    const rows = await this.database
      .select({
        box: boxes,
        role: boxMemberships.role,
        cursorAt: cursorTimestamp(boxMemberships.joinedAt),
      })
      .from(boxMemberships)
      .innerJoin(boxes, eq(boxes.id, boxMemberships.boxId))
      .where(
        and(
          eq(boxMemberships.userId, viewerId),
          eq(boxMemberships.status, 'active'),
          afterCursor(
            boxMemberships.joinedAt,
            boxes.id,
            decodeCursor(query.cursor),
            'desc',
          ),
        ),
      )
      .orderBy(desc(boxMemberships.joinedAt), desc(boxes.id))
      .limit(query.limit + 1);
    const counts = await memberCounts(
      this.database,
      rows.map((row) => row.box.id),
    );
    return pageOf(
      rows,
      query.limit,
      (row) => ({ at: row.cursorAt, id: row.box.id }),
      (row) => toBoxView(row.box, row.role, counts.get(row.box.id) ?? 0),
    );
  }

  public async get(viewerId: string, boxId: string): Promise<BoxView> {
    const membership = await this.policy.membership(viewerId, boxId);
    const view = await loadBoxView(this.database, boxId, membership.role);
    if (!view) throw boxNotFound();
    return view;
  }

  /**
   * Membership is a fact about the Box, not authored content, so a block
   * between two members does not remove either from this list (ADR 013).
   * Content they wrote is what the block hides, in later phases.
   */
  public async members(
    viewerId: string,
    boxId: string,
    query: PageQuery,
  ): Promise<Page<BoxMemberView>> {
    await this.policy.membership(viewerId, boxId);
    const rows = await this.database
      .select({
        membership: boxMemberships,
        cursorAt: cursorTimestamp(boxMemberships.joinedAt),
      })
      .from(boxMemberships)
      .innerJoin(users, eq(users.id, boxMemberships.userId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.status, 'active'),
          eq(users.status, 'active'),
          isNotNull(profiles.username),
          afterCursor(
            boxMemberships.joinedAt,
            boxMemberships.userId,
            decodeCursor(query.cursor),
            'asc',
          ),
        ),
      )
      .orderBy(asc(boxMemberships.joinedAt), asc(boxMemberships.userId))
      .limit(query.limit + 1);
    const people = await this.summaries.summaries(
      rows.map((row) => row.membership.userId),
    );
    return pageOf(
      rows.filter((row) => people.has(row.membership.userId)),
      query.limit,
      (row) => ({ at: row.cursorAt, id: row.membership.userId }),
      (row) => ({
        user: people.get(row.membership.userId) as BoxMemberView['user'],
        role: row.membership.role,
        status: row.membership.status,
        joinedAt: row.membership.joinedAt.toISOString(),
      }),
    );
  }
}
