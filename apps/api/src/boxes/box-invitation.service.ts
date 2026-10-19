import { Inject, Injectable } from '@nestjs/common';
import {
  boxInvitations,
  boxMemberships,
  boxes,
  hiddenByBlock,
  isBlockedBetween,
  lockPair,
  type BoxInvitationRow,
  type DatabaseExecutor,
  type PaldoraDatabase,
} from '@paldora/database';
import { BOX_INVITATION_TTL_DAYS } from '@paldora/domain';
import type {
  BoxInvitationView,
  BoxView,
  UserSummary,
} from '@paldora/validation';
import { and, desc, eq, gt, lte, not, or } from 'drizzle-orm';
import { ProfileSummaryService } from '../identity/profile-summary.service.js';
import {
  UserDirectoryService,
  userNotFound,
} from '../identity/user-directory.service.js';
import { isUniqueViolation } from '../platform/database-errors.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import {
  afterCursor,
  cursorTimestamp,
  decodeCursor,
  pageOf,
  type Page,
} from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { RealtimeBus } from '../realtime/realtime-bus.js';
import {
  alreadyBoxMember,
  boxArchived,
  boxNotFound,
  cannotInviteSelf,
  invitationAlreadyPending,
  invitationExpired,
  invitationNotFound,
} from './box-errors.js';
import { BoxPolicyService } from './box-policy.service.js';
import { loadBoxView } from './box-views.js';
import type { PageQuery } from './box-query.service.js';

const DAY_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class BoxInvitationService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(UserDirectoryService)
    private readonly directory: UserDirectoryService,
    @Inject(ProfileSummaryService)
    private readonly summaries: ProfileSummaryService,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  /**
   * Invites anyone by username. Blocks are decided inside the pair lock, so a
   * block that lands first prevents the invitation and one that lands after
   * revokes it (see `revokePendingBetween`).
   */
  public async invite(
    inviterId: string,
    boxId: string,
    username: string,
  ): Promise<BoxInvitationView> {
    await this.policy.requireManager(
      inviterId,
      boxId,
      'Only owners and admins can invite people.',
    );
    const inviteeId = await this.directory.resolveForOutreach(
      inviterId,
      username,
    );
    if (inviteeId === inviterId) throw cannotInviteSelf();
    const row = await this.database
      .transaction(async (transaction) => {
        await lockPair(transaction, inviterId, inviteeId);
        if (await isBlockedBetween(transaction, inviterId, inviteeId)) {
          throw userNotFound();
        }
        const [box] = await transaction
          .select({ status: boxes.status })
          .from(boxes)
          .where(eq(boxes.id, boxId))
          .for('share')
          .limit(1);
        if (!box) throw boxNotFound();
        if (box.status !== 'active') throw boxArchived();
        const [member] = await transaction
          .select({ userId: boxMemberships.userId })
          .from(boxMemberships)
          .where(
            and(
              eq(boxMemberships.boxId, boxId),
              eq(boxMemberships.userId, inviteeId),
              eq(boxMemberships.status, 'active'),
            ),
          )
          .limit(1);
        if (member) throw alreadyBoxMember();
        // A stale pending row would block the unique index; retire it first.
        await transaction
          .update(boxInvitations)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(
            and(
              eq(boxInvitations.boxId, boxId),
              eq(boxInvitations.inviteeUserId, inviteeId),
              eq(boxInvitations.status, 'pending'),
              lte(boxInvitations.expiresAt, new Date()),
            ),
          );
        const [created] = await transaction
          .insert(boxInvitations)
          .values({
            boxId,
            inviterUserId: inviterId,
            inviteeUserId: inviteeId,
            expiresAt: new Date(Date.now() + BOX_INVITATION_TTL_DAYS * DAY_MS),
          })
          .returning();
        return created;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error, 'box_invitations_pending_pair_unique')) {
          throw invitationAlreadyPending();
        }
        throw error;
      });
    if (!row) throw new Error('Invitation insert returned no row.');
    const [view] = await this.views(
      [row],
      new Map([[boxId, await this.boxName(boxId)]]),
    );
    if (!view) throw userNotFound();
    return view;
  }

  /** Pending, unexpired invitations for one Box (owners and admins). */
  public async listForBox(
    viewerId: string,
    boxId: string,
    query: PageQuery,
  ): Promise<Page<BoxInvitationView>> {
    await this.policy.requireManager(
      viewerId,
      boxId,
      'Only owners and admins can see invitations.',
    );
    return this.page(and(eq(boxInvitations.boxId, boxId), this.open()), query);
  }

  /** Invitations waiting for the viewer, minus anyone a block hides. */
  public listMine(
    viewerId: string,
    query: PageQuery,
  ): Promise<Page<BoxInvitationView>> {
    return this.page(
      and(
        eq(boxInvitations.inviteeUserId, viewerId),
        this.open(),
        eq(boxes.status, 'active'),
        not(hiddenByBlock(viewerId, boxInvitations.inviterUserId)),
      ),
      query,
    );
  }

  public async revoke(
    viewerId: string,
    boxId: string,
    invitationId: string,
  ): Promise<void> {
    await this.policy.requireManager(
      viewerId,
      boxId,
      'Only owners and admins can withdraw invitations.',
    );
    const revoked = await this.database
      .update(boxInvitations)
      .set({
        status: 'revoked',
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(boxInvitations.id, invitationId),
          eq(boxInvitations.boxId, boxId),
          eq(boxInvitations.status, 'pending'),
        ),
      )
      .returning({ id: boxInvitations.id });
    if (revoked.length === 0) throw invitationNotFound();
  }

  public async decline(viewerId: string, invitationId: string): Promise<void> {
    const declined = await this.database
      .update(boxInvitations)
      .set({
        status: 'declined',
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(boxInvitations.id, invitationId),
          eq(boxInvitations.inviteeUserId, viewerId),
          eq(boxInvitations.status, 'pending'),
        ),
      )
      .returning({ id: boxInvitations.id });
    if (declined.length === 0) throw invitationNotFound();
  }

  /**
   * Accepting joins the Box. The invitation is re-read under the pair lock,
   * so a block placed since it was sent cannot be accepted around.
   */
  public async accept(
    viewerId: string,
    invitationId: string,
  ): Promise<BoxView> {
    const outcome = await this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select()
        .from(boxInvitations)
        .where(
          and(
            eq(boxInvitations.id, invitationId),
            eq(boxInvitations.inviteeUserId, viewerId),
          ),
        )
        .limit(1);
      if (!candidate) throw invitationNotFound();
      await lockPair(transaction, candidate.inviterUserId, viewerId);
      const [invitation] = await transaction
        .select()
        .from(boxInvitations)
        .where(eq(boxInvitations.id, invitationId))
        .for('update')
        .limit(1);
      if (
        !invitation ||
        invitation.status !== 'pending' ||
        (await isBlockedBetween(
          transaction,
          invitation.inviterUserId,
          viewerId,
        ))
      ) {
        throw invitationNotFound();
      }
      if (invitation.expiresAt <= new Date()) {
        await this.setStatus(transaction, invitation.id, 'expired');
        return { expired: true as const };
      }
      const [box] = await transaction
        .select({ status: boxes.status })
        .from(boxes)
        .where(eq(boxes.id, invitation.boxId))
        .for('share')
        .limit(1);
      if (!box) throw invitationNotFound();
      if (box.status !== 'active') throw boxArchived();
      await this.setStatus(transaction, invitation.id, 'accepted');
      await transaction
        .insert(boxMemberships)
        .values({ boxId: invitation.boxId, userId: viewerId })
        .onConflictDoUpdate({
          target: [boxMemberships.boxId, boxMemberships.userId],
          set: {
            role: 'member',
            status: 'active',
            joinedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      return { boxId: invitation.boxId };
    });
    if ('expired' in outcome) throw invitationExpired();
    await this.bus.membershipsChanged([viewerId]);
    const view = await loadBoxView(this.database, outcome.boxId, 'member');
    if (!view) throw boxNotFound();
    return view;
  }

  /**
   * Called by blocking, inside its transaction: invitations between the two
   * people, in either direction, are withdrawn. Membership is untouched.
   */
  public async revokePendingBetween(
    executor: DatabaseExecutor,
    first: string,
    second: string,
  ): Promise<void> {
    await executor
      .update(boxInvitations)
      .set({
        status: 'revoked',
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(boxInvitations.status, 'pending'),
          or(
            and(
              eq(boxInvitations.inviterUserId, first),
              eq(boxInvitations.inviteeUserId, second),
            ),
            and(
              eq(boxInvitations.inviterUserId, second),
              eq(boxInvitations.inviteeUserId, first),
            ),
          ),
        ),
      );
  }

  private open() {
    return and(
      eq(boxInvitations.status, 'pending'),
      gt(boxInvitations.expiresAt, new Date()),
    );
  }

  private setStatus(
    executor: DatabaseExecutor,
    id: string,
    status: 'accepted' | 'expired',
  ) {
    return executor
      .update(boxInvitations)
      .set({
        status,
        ...(status === 'expired' ? {} : { respondedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(boxInvitations.id, id));
  }

  private async boxName(boxId: string): Promise<string> {
    const [row] = await this.database
      .select({ name: boxes.name })
      .from(boxes)
      .where(eq(boxes.id, boxId))
      .limit(1);
    if (!row) throw boxNotFound();
    return row.name;
  }

  private async page(
    where: ReturnType<typeof and>,
    query: PageQuery,
  ): Promise<Page<BoxInvitationView>> {
    const rows = await this.database
      .select({
        invitation: boxInvitations,
        boxName: boxes.name,
        cursorAt: cursorTimestamp(boxInvitations.createdAt),
      })
      .from(boxInvitations)
      .innerJoin(boxes, eq(boxes.id, boxInvitations.boxId))
      .where(
        and(
          where,
          afterCursor(
            boxInvitations.createdAt,
            boxInvitations.id,
            decodeCursor(query.cursor),
            'desc',
          ),
        ),
      )
      .orderBy(desc(boxInvitations.createdAt), desc(boxInvitations.id))
      .limit(query.limit + 1);
    const names = new Map(
      rows.map((row) => [row.invitation.boxId, row.boxName]),
    );
    const views = await this.views(
      rows.map((row) => row.invitation),
      names,
    );
    const byId = new Map(views.map((view) => [view.id, view]));
    return pageOf(
      rows.filter((row) => byId.has(row.invitation.id)),
      query.limit,
      (row) => ({ at: row.cursorAt, id: row.invitation.id }),
      (row) => byId.get(row.invitation.id) as BoxInvitationView,
    );
  }

  /** Invitations whose people are no longer visible are dropped. */
  private async views(
    rows: readonly BoxInvitationRow[],
    boxNames: ReadonlyMap<string, string>,
  ): Promise<BoxInvitationView[]> {
    const people = await this.summaries.summaries(
      rows.flatMap((row) => [row.inviterUserId, row.inviteeUserId]),
    );
    return rows.flatMap((row) => {
      const inviter: UserSummary | undefined = people.get(row.inviterUserId);
      const invitee: UserSummary | undefined = people.get(row.inviteeUserId);
      if (!inviter || !invitee) return [];
      return [
        {
          id: row.id,
          box: { id: row.boxId, name: boxNames.get(row.boxId) ?? '' },
          inviter,
          invitee,
          expiresAt: row.expiresAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });
  }
}
