import { Inject, Injectable } from '@nestjs/common';
import {
  mediaAssets,
  profiles,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type { UserSummary } from '@paldora/validation';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { MediaUrlService } from '../media/media-urls.service.js';
import { DATABASE } from '../platform/config/tokens.js';

/**
 * Turns user IDs into the public face of a person: name, username, and a
 * signed thumbnail. It performs NO authorization. Callers must pass only
 * people the viewer is already allowed to see (friends, request parties,
 * Box co-members), which is why every list service filters first.
 */
@Injectable()
export class ProfileSummaryService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
  ) {}

  /** Active people with a username. Anyone else is simply absent. */
  public async summaries(
    userIds: readonly string[],
  ): Promise<Map<string, UserSummary>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.database
      .select({
        id: users.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatar: {
          id: mediaAssets.id,
          status: mediaAssets.status,
          thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
        },
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .leftJoin(mediaAssets, eq(mediaAssets.id, profiles.avatarMediaId))
      .where(
        and(
          inArray(users.id, unique),
          eq(users.status, 'active'),
          isNotNull(profiles.username),
        ),
      );
    const entries = await Promise.all(
      rows.map(async (row) => {
        const username = row.username ?? '';
        const summary: UserSummary = {
          id: row.id,
          username,
          displayName: row.displayName ?? username,
          avatarUrl: await this.mediaUrls.signThumbnail(row.avatar),
        };
        return [row.id, summary] as const;
      }),
    );
    return new Map(entries);
  }
}
