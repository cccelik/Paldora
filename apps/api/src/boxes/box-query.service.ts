import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  profiles,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { BoxMemberView, BoxView } from '@paldora/validation';
import { and, eq, isNotNull } from 'drizzle-orm';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import {
  keysetWindow,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
  type PageQuery,
} from '../platform/pagination/pagination.js';
import { DATABASE } from '../platform/config/tokens.js';
import { boxNotFound } from './box-errors.js';
import { BoxPolicyService } from './box-policy.service.js';
import { loadBoxView, memberCounts, toBoxView } from './box-views.js';

@Injectable()
export class BoxQueryService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(ProfileSummaryService)
    private readonly summaries: ProfileSummaryService,
  ) {}

  /** The viewer's active Boxes, newest membership first. */
  public async list(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<BoxView>> {
    const keyset = keysetWindow(
      boxMemberships.joinedAt,
      boxes.id,
      decodeCursor(query.cursor),
      'desc',
    );
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
          keyset.after,
        ),
      )
      .orderBy(...keyset.orderBy)
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
    const keyset = keysetWindow(
      boxMemberships.joinedAt,
      boxMemberships.userId,
      decodeCursor(query.cursor),
      'asc',
    );
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
          keyset.after,
        ),
      )
      .orderBy(...keyset.orderBy)
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
