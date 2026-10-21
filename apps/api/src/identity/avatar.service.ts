import { Inject, Injectable } from '@nestjs/common';
import {
  mediaAssets,
  mediaDeletionJob,
  mediaJobOutbox,
  profiles,
  storedObjectKeys,
  type PaldoraDatabase,
} from '@paldora/database';
import type { UserId } from '@paldora/domain';
import { eq } from 'drizzle-orm';
import { DATABASE } from '../platform/config/tokens.js';

@Injectable()
export class AvatarService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
  ) {}

  /**
   * Detaches the current avatar and, in the same transaction, records the
   * deletion of every stored object it owns. Idempotent.
   */
  public async remove(userId: UserId): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [profile] = await transaction
        .select({ avatarMediaId: profiles.avatarMediaId })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .for('update')
        .limit(1);
      if (!profile?.avatarMediaId) return;
      await transaction
        .update(profiles)
        .set({ avatarMediaId: null, updatedAt: new Date() })
        .where(eq(profiles.userId, userId));
      const [asset] = await transaction
        .update(mediaAssets)
        .set({ status: 'deleted', updatedAt: new Date() })
        .where(eq(mediaAssets.id, profile.avatarMediaId))
        .returning();
      if (asset) {
        await transaction
          .insert(mediaJobOutbox)
          .values(mediaDeletionJob(storedObjectKeys(asset)));
      }
    });
  }
}
