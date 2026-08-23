import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  mediaAssets,
  mediaJobOutbox,
  type PaldoraDatabase,
} from '@paldora/database';
import type { Box, BoxId, UserId } from '@paldora/domain';
import { and, count, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { BoxAuthorizationPolicy } from './box-authorization-policy.service.js';
import { mapBox } from './box-mappers.js';
import { InfrastructureService } from './infrastructure.service.js';
import { mediaDeletionOutboxEntry } from './media-job-outbox.js';

@Injectable()
export class BoxLifecycleService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(BoxAuthorizationPolicy)
    private readonly policy: BoxAuthorizationPolicy,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async create(userId: UserId, name: string): Promise<Box> {
    const cleanName = name.trim();
    const slug = this.createSlug(cleanName);
    const created = await this.database.transaction(async (transaction) => {
      const [box] = await transaction
        .insert(boxes)
        .values({ name: cleanName, slug, ownerUserId: userId })
        .returning();
      if (!box) throw new Error('Box insert did not return a row.');
      await transaction.insert(boxMemberships).values({
        boxId: box.id,
        userId,
        role: 'owner',
      });
      return box;
    });
    return mapBox(created, 'owner', 1);
  }

  public async update(
    userId: UserId,
    boxId: BoxId,
    input: {
      name?: string | undefined;
      status?: 'active' | 'archived' | undefined;
    },
  ): Promise<Box> {
    const membership = await this.policy.requireMembership(userId, boxId);
    if (membership.role !== 'owner') {
      this.policy.forbidden('Only the owner can edit this Box.');
    }
    const [box] = await this.database
      .update(boxes)
      .set({
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(boxes.id, boxId))
      .returning();
    if (!box) this.policy.notFound();
    const [{ value: memberCount } = { value: 0 }] = await this.database
      .select({ value: count() })
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, boxId),
          eq(boxMemberships.status, 'active'),
        ),
      );
    return mapBox(box, 'owner', memberCount);
  }

  public async deleteBox(
    userId: UserId,
    boxId: BoxId,
  ): Promise<{ success: true }> {
    const membership = await this.policy.requireMembership(userId, boxId);
    if (membership.role !== 'owner') {
      this.policy.forbidden(
        'Only the Box owner can permanently delete this Box.',
      );
    }
    const deleted = await this.database.transaction(async (transaction) => {
      const linkedMedia = await transaction
        .select({
          id: mediaAssets.id,
          objectKey: mediaAssets.objectKey,
          displayObjectKey: mediaAssets.displayObjectKey,
          thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
        })
        .from(mediaAssets)
        .where(eq(mediaAssets.boxId, boxId))
        .for('update');
      if (linkedMedia.length > 0) {
        await transaction
          .insert(mediaJobOutbox)
          .values(linkedMedia.map(mediaDeletionOutboxEntry));
      }
      const [removed] = await transaction
        .delete(boxes)
        .where(and(eq(boxes.id, boxId), eq(boxes.ownerUserId, userId)))
        .returning({ id: boxes.id });
      return removed;
    });
    if (!deleted) this.policy.notFound();
    return { success: true };
  }

  private createSlug(name: string): string {
    const base =
      name
        .normalize('NFKD')
        .replace(/\p{Mark}/gu, '')
        .toLocaleLowerCase('en-US')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'box';
    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}
