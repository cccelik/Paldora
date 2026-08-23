import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  profiles,
  type PaldoraDatabase,
} from '@paldora/database';
import type { Box, BoxId, BoxMember, UserId } from '@paldora/domain';
import { and, count, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { BoxAuthorizationPolicy } from './box-authorization-policy.service.js';
import { mapBox } from './box-mappers.js';
import { InfrastructureService } from './infrastructure.service.js';
import { ProfileAvatarService } from './profile-avatar.service.js';

@Injectable()
export class BoxQueryService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
    @Inject(BoxAuthorizationPolicy)
    private readonly policy: BoxAuthorizationPolicy,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async list(userId: UserId): Promise<Box[]> {
    const activeMembers = alias(boxMemberships, 'active_box_members');
    const rows = await this.database
      .select({
        box: boxes,
        role: boxMemberships.role,
        memberCount: count(activeMembers.userId),
      })
      .from(boxMemberships)
      .innerJoin(boxes, eq(boxes.id, boxMemberships.boxId))
      .leftJoin(
        activeMembers,
        and(
          eq(activeMembers.boxId, boxes.id),
          eq(activeMembers.status, 'active'),
        ),
      )
      .where(
        and(
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .groupBy(boxes.id, boxMemberships.role);
    return rows.map(({ box, role, memberCount }) =>
      mapBox(box, role, memberCount),
    );
  }

  public async get(userId: UserId, boxId: BoxId): Promise<Box> {
    const activeMembers = alias(boxMemberships, 'active_box_members');
    const [row] = await this.database
      .select({
        box: boxes,
        role: boxMemberships.role,
        memberCount: count(activeMembers.userId),
      })
      .from(boxMemberships)
      .innerJoin(boxes, eq(boxes.id, boxMemberships.boxId))
      .leftJoin(
        activeMembers,
        and(
          eq(activeMembers.boxId, boxes.id),
          eq(activeMembers.status, 'active'),
        ),
      )
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .groupBy(boxes.id, boxMemberships.role)
      .limit(1);
    if (!row) this.policy.notFound();
    return mapBox(row.box, row.role, row.memberCount);
  }

  public async members(userId: UserId, boxId: BoxId): Promise<BoxMember[]> {
    await this.policy.requireMembership(userId, boxId);
    const rows = await this.database
      .select({ membership: boxMemberships, profile: profiles })
      .from(boxMemberships)
      .innerJoin(profiles, eq(profiles.userId, boxMemberships.userId))
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    const avatarUrls = await this.avatars.forUsers(
      rows.map(({ membership }) => membership.userId as UserId),
    );
    return rows.map(({ membership, profile }) => ({
      userId: membership.userId as UserId,
      username: profile.username ?? '',
      displayName: profile.displayName ?? profile.username ?? 'Paldora member',
      avatarUrl: avatarUrls.get(membership.userId as UserId) ?? null,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt.toISOString(),
    }));
  }
}
