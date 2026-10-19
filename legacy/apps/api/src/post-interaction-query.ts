import { Inject, Injectable } from '@nestjs/common';
import {
  comments,
  mediaAssets,
  postReactions,
  profiles,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  MediaAssetId,
  PostId,
  PostInteractions,
  ReactionKind,
  UserId,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { InfrastructureService } from './infrastructure.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';

@Injectable()
export class PostInteractionQueryService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async load(
    userId: UserId,
    postIds: readonly PostId[],
  ): Promise<Map<string, PostInteractions>> {
    const result = new Map<string, PostInteractions>();
    if (postIds.length === 0) return result;
    const [reactionRows, commentRows, ownRows, realRows] = await Promise.all([
      this.database
        .select({
          postId: postReactions.postId,
          kind: postReactions.kind,
          value: count(),
        })
        .from(postReactions)
        .where(inArray(postReactions.postId, postIds))
        .groupBy(postReactions.postId, postReactions.kind),
      this.database
        .select({ postId: comments.postId, value: count() })
        .from(comments)
        .where(
          and(inArray(comments.postId, postIds), eq(comments.status, 'active')),
        )
        .groupBy(comments.postId),
      this.database
        .select({ postId: postReactions.postId, kind: postReactions.kind })
        .from(postReactions)
        .where(
          and(
            inArray(postReactions.postId, postIds),
            eq(postReactions.userId, userId),
          ),
        ),
      this.database
        .select({
          postId: postReactions.postId,
          userId: postReactions.userId,
          createdAt: postReactions.createdAt,
          profile: profiles,
          asset: mediaAssets,
        })
        .from(postReactions)
        .innerJoin(profiles, eq(profiles.userId, postReactions.userId))
        .innerJoin(mediaAssets, eq(mediaAssets.id, postReactions.mediaAssetId))
        .where(
          and(
            inArray(postReactions.postId, postIds),
            eq(postReactions.kind, 'real'),
          ),
        )
        .orderBy(desc(postReactions.createdAt)),
    ]);
    for (const postId of postIds) {
      result.set(postId, emptyPostInteractionSummary());
    }
    for (const row of reactionRows) {
      result.get(row.postId)?.reactions.push({
        kind: row.kind as ReactionKind,
        count: Number(row.value),
      });
    }
    for (const row of commentRows) {
      const summary = result.get(row.postId);
      if (summary) summary.commentCount = Number(row.value);
    }
    for (const row of ownRows) {
      const summary = result.get(row.postId);
      if (summary) summary.currentUserReaction = row.kind as ReactionKind;
    }
    await Promise.all(
      realRows.map(
        async ({ postId, userId: reactorId, createdAt, profile, asset }) => {
          const ready = asset.status === 'ready' && asset.displayObjectKey;
          const [url, thumbnailUrl] = ready
            ? await Promise.all([
                this.sign(asset.displayObjectKey!),
                this.sign(asset.thumbnailObjectKey ?? asset.displayObjectKey!),
              ])
            : [null, null];
          result.get(postId)?.realReactions.push({
            userId: reactorId as UserId,
            username: profile.username ?? '',
            displayName:
              profile.displayName ?? profile.username ?? 'Paldora member',
            mediaAssetId: asset.id as MediaAssetId,
            status:
              asset.status === 'ready' || asset.status === 'failed'
                ? asset.status
                : 'processing',
            url,
            thumbnailUrl,
            createdAt: createdAt.toISOString(),
          });
        },
      ),
    );
    return result;
  }

  private sign(objectKey: string): Promise<string | null> {
    return this.storage.createSignedDownload(objectKey, 900).catch(() => null);
  }
}

export function emptyPostInteractionSummary(): PostInteractions {
  return {
    commentCount: 0,
    reactions: [],
    currentUserReaction: null,
    realReactions: [],
  };
}
