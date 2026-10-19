import { Inject, Injectable } from '@nestjs/common';
import { mediaAssets, profiles, type PaldoraDatabase } from '@paldora/database';
import type { UserId } from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { eq, inArray } from 'drizzle-orm';
import { InfrastructureService } from './infrastructure.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';

@Injectable()
export class ProfileAvatarService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async forUser(userId: UserId): Promise<string | null> {
    return (await this.forUsers([userId])).get(userId) ?? null;
  }

  public async forUsers(
    userIds: readonly UserId[],
  ): Promise<Map<UserId, string | null>> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) return new Map();
    const rows = await this.database
      .select({
        userId: profiles.userId,
        avatar: {
          objectKey: mediaAssets.objectKey,
          status: mediaAssets.status,
        },
      })
      .from(profiles)
      .leftJoin(mediaAssets, eq(mediaAssets.id, profiles.avatarMediaId))
      .where(inArray(profiles.userId, uniqueUserIds));
    const signedObjects = new Map<string, Promise<string | null>>();
    const entries = await Promise.all(
      rows.map(
        async ({ userId, avatar }) =>
          [
            userId as UserId,
            avatar?.status === 'ready'
              ? await this.sign(avatar.objectKey, signedObjects)
              : null,
          ] as const,
      ),
    );
    return new Map(entries);
  }

  private sign(
    objectKey: string,
    cache: Map<string, Promise<string | null>>,
  ): Promise<string | null> {
    const existing = cache.get(objectKey);
    if (existing) return existing;
    const signed = this.storage
      .createSignedDownload(objectKey, 900)
      .catch(() => null);
    cache.set(objectKey, signed);
    return signed;
  }
}
