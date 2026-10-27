import { ApiClientError, type PageOptions } from '@/lib/server/web-data-error';
import {
  NativeBoxDeletionError,
  NativeHomeFeed,
} from '@paldora/firebase-trusted';
import {
  type BoxInvitationView,
  type BoxMemberView,
  type BoxView,
} from '@paldora/validation';
import { boxAbsent, iso, person, viewBox } from './data-views';
import type { WebDataContext } from './data-context';
import 'server-only';

/** Boxes, members and invitations. */
export class BoxesData {
  public constructor(private readonly ctx: WebDataContext) {}

  public async boxes(page: PageOptions = {}) {
    const result = await this.ctx.boxesService.list(
      this.ctx.uid,
      page.cursor,
      page.limit,
    );
    return { ...result, items: result.items.map(viewBox) };
  }

  public async createBox(body: { name: string }): Promise<BoxView> {
    return viewBox(await this.ctx.boxesService.create(this.ctx.uid, body.name));
  }

  public async box(boxId: string): Promise<BoxView> {
    return this.ctx.box(boxId);
  }

  public async updateBox(
    boxId: string,
    body: { name?: string; status?: 'active' | 'archived' },
  ) {
    return viewBox(
      await this.ctx.boxesService.update(boxId, this.ctx.uid, body),
    );
  }

  public async deleteBox(boxId: string, confirmName: string) {
    await this.ctx.deletionService.start(boxId, this.ctx.uid, confirmName);
    if (!(await this.drainDeletion(boxId, 100)))
      throw new ApiClientError(
        409,
        'BOX_DELETION_PENDING',
        'Box deletion is still running. Retry in a moment.',
        null,
      );
  }

  private async drainDeletion(
    boxId: string,
    remaining: number,
  ): Promise<boolean> {
    if (remaining === 0) return false;
    const phase = await this.ctx.deletionService
      .processOnce(boxId)
      .catch((error: unknown) => {
        if (
          error instanceof NativeBoxDeletionError &&
          error.code === 'DEPENDENCY_PENDING'
        )
          return null;
        throw error;
      });
    if (phase === 'complete') return true;
    if (phase === null) return false;
    return this.drainDeletion(boxId, remaining - 1);
  }

  public async boxMembers(boxId: string, page: PageOptions = {}) {
    const result = await this.ctx.membersService
      .list(boxId, this.ctx.uid, page.cursor, page.limit)
      .catch(boxAbsent);
    return {
      ...result,
      items: result.items.map((item): BoxMemberView => ({
        user: person(
          item.uid,
          item.username ?? item.uid,
          item.displayName ?? item.username ?? item.uid,
        ),
        role: item.role,
        status: 'active',
        joinedAt: iso(item.joinedAt),
      })),
    };
  }

  public async setBoxMemberRole(
    boxId: string,
    userId: string,
    role: 'admin' | 'member',
  ) {
    return this.ctx.boxesService.changeRole(boxId, this.ctx.uid, userId, role);
  }

  public async removeBoxMember(boxId: string, userId: string) {
    return this.ctx.boxesService.removeMember(boxId, this.ctx.uid, userId);
  }

  public async leaveBox(boxId: string) {
    return this.ctx.boxesService.removeMember(
      boxId,
      this.ctx.uid,
      this.ctx.uid,
    );
  }

  public async transferBoxOwnership(boxId: string, userId: string) {
    return this.ctx.boxesService.transfer(boxId, this.ctx.uid, userId);
  }

  public async inviteToBox(boxId: string, username: string) {
    return this.ctx.invitationsService.inviteByUsername(
      boxId,
      this.ctx.uid,
      username,
    );
  }

  public async revokeBoxInvitation(boxId: string, invitationId: string) {
    return this.ctx.invitationsService.revoke(
      invitationId,
      boxId,
      this.ctx.uid,
    );
  }

  public async acceptBoxInvitation(invitationId: string) {
    const boxId = await this.ctx.invitationsService.accept(
      invitationId,
      this.ctx.uid,
    );
    const member = await this.ctx.services.db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(this.ctx.uid)
      .get();
    const joinedAt = member.get('joinedAt') as number | undefined;
    if (joinedAt !== undefined) {
      const jobId = NativeHomeFeed.joinJobId(boxId, this.ctx.uid, joinedAt);
      for (let i = 0; i < 8; i += 1) {
        try {
          // Each page advances the same durable cursor.
          // eslint-disable-next-line no-await-in-loop
          const phase = await this.ctx.homeFeedService.processOnce(jobId);
          if (phase === 'complete') break;
        } catch {
          // Membership is committed; the durable job remains available for repair.
          break;
        }
      }
    }
    return boxId;
  }

  public async declineBoxInvitation(invitationId: string) {
    return this.ctx.invitationsService.decline(invitationId, this.ctx.uid);
  }

  public async myBoxInvitations(page: PageOptions = {}) {
    const result = await this.ctx.invitationsService.listPending(
      this.ctx.uid,
      page.cursor,
      Date.now(),
      page.limit,
    );
    const current = await this.ctx.profilesService.current(this.ctx.uid);
    const invitee = person(
      this.ctx.uid,
      current.profile.username ?? this.ctx.uid,
      current.profile.displayName ?? current.profile.username ?? this.ctx.uid,
    );
    return {
      ...result,
      items: result.items.map((item): BoxInvitationView => ({
        id: item.id,
        box: { id: item.boxId, name: item.boxName },
        inviter: person(
          item.inviterUid,
          item.inviterUsername,
          item.inviterDisplayName,
        ),
        invitee,
        expiresAt: iso(item.expiresAt),
        createdAt: iso(item.createdAt),
      })),
    };
  }

  public async boxInvitations(boxId: string, page: PageOptions = {}) {
    const box = await this.ctx.box(boxId);
    const result = await this.ctx.invitationsService
      .listForBox(boxId, this.ctx.uid, page.cursor, Date.now(), page.limit)
      .catch(boxAbsent);
    return {
      ...result,
      items: result.items.map((item): BoxInvitationView => ({
        id: item.id,
        box: { id: boxId, name: box.name },
        inviter: person(
          item.inviterUid,
          item.inviterUsername ?? item.inviterUid,
          item.inviterDisplayName ?? item.inviterUsername ?? item.inviterUid,
        ),
        invitee: person(
          item.inviteeUid,
          item.inviteeUsername ?? item.inviteeUid,
          item.inviteeDisplayName ?? item.inviteeUsername ?? item.inviteeUid,
        ),
        expiresAt: iso(item.expiresAt),
        createdAt: iso(item.createdAt),
      })),
    };
  }
}
