import { Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  friendships,
  lifeUpdateDeliveries,
  lifeUpdates,
  posts,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  BoxId,
  LifeUpdateId,
  MemoryItem,
  MemoryPage,
  MemoryYear,
  PostId,
  UserId,
} from '@paldora/domain';
import { and, desc, eq, exists, gte, lt, notExists, or } from 'drizzle-orm';
import { InfrastructureService } from './infrastructure.service.js';
import { LifeUpdateService } from './life-update.service.js';
import { decodePostCursor, encodePostCursor } from './post-cursor.js';
import { PostService } from './post.service.js';

interface MemoryQuery {
  year: number;
  month?: number | undefined;
  cursor?: string | undefined;
  limit: number;
}

interface MemoryReference {
  id: string;
  type: 'post' | 'life_update';
  occurredAt: Date;
}

@Injectable()
export class MemoryService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(PostService) private readonly postService: PostService,
    @Inject(LifeUpdateService)
    private readonly lifeUpdateService: LifeUpdateService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async mine(userId: UserId, input: MemoryQuery): Promise<MemoryPage> {
    const references = await this.references(userId, input);
    return this.mapPage(userId, references, input.limit);
  }

  public async box(
    userId: UserId,
    boxId: BoxId,
    input: MemoryQuery,
  ): Promise<MemoryPage> {
    await this.lifeUpdateService.listBox(userId, boxId, { limit: 1 });
    const references = await this.references(userId, input, boxId);
    return this.mapPage(userId, references, input.limit);
  }

  public async years(userId: UserId, boxId?: BoxId): Promise<MemoryYear[]> {
    if (boxId)
      await this.lifeUpdateService.listBox(userId, boxId, { limit: 1 });
    const references = await this.references(
      userId,
      { year: 1970, limit: 10_000 },
      boxId,
      false,
    );
    const counts = new Map<number, number>();
    for (const reference of references) {
      const year = reference.occurredAt.getUTCFullYear();
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
    return [...counts]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);
  }

  private async references(
    userId: UserId,
    input: MemoryQuery,
    boxId?: BoxId,
    constrainPeriod = true,
  ): Promise<MemoryReference[]> {
    const { start, end } = period(input.year, input.month);
    const cursor = input.cursor ? decodePostCursor(input.cursor) : null;
    const dateCondition = constrainPeriod
      ? and(gte(posts.createdAt, start), lt(posts.createdAt, end))
      : undefined;
    const cursorCondition = cursor
      ? or(
          lt(posts.createdAt, cursor.createdAt),
          and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
        )
      : undefined;
    const membership = exists(
      this.database
        .select({ id: boxMemberships.userId })
        .from(boxMemberships)
        .where(
          and(
            eq(boxMemberships.boxId, posts.boxId),
            eq(boxMemberships.userId, userId),
            eq(boxMemberships.status, 'active'),
          ),
        ),
    );
    const postRows = await this.database
      .select({ id: posts.id, occurredAt: posts.createdAt })
      .from(posts)
      .where(
        and(
          eq(posts.status, 'active'),
          boxId ? eq(posts.boxId, boxId) : membership,
          dateCondition,
          cursorCondition,
          notExists(
            this.database
              .select({ id: lifeUpdateDeliveries.postId })
              .from(lifeUpdateDeliveries)
              .where(eq(lifeUpdateDeliveries.postId, posts.id)),
          ),
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(input.limit + 1);

    const lifeDate = constrainPeriod
      ? and(gte(lifeUpdates.createdAt, start), lt(lifeUpdates.createdAt, end))
      : undefined;
    const lifeCursor = cursor
      ? or(
          lt(lifeUpdates.createdAt, cursor.createdAt),
          and(
            eq(lifeUpdates.createdAt, cursor.createdAt),
            lt(lifeUpdates.id, cursor.id),
          ),
        )
      : undefined;
    const lifeRows = await this.database
      .selectDistinct({ id: lifeUpdates.id, occurredAt: lifeUpdates.createdAt })
      .from(lifeUpdates)
      .innerJoin(
        lifeUpdateDeliveries,
        eq(lifeUpdateDeliveries.lifeUpdateId, lifeUpdates.id),
      )
      .leftJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, lifeUpdateDeliveries.boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(
        and(
          eq(lifeUpdates.status, 'active'),
          boxId
            ? eq(lifeUpdateDeliveries.boxId, boxId)
            : or(
                and(
                  eq(lifeUpdateDeliveries.audience, 'only_me'),
                  eq(lifeUpdates.authorUserId, userId),
                ),
                eq(boxMemberships.userId, userId),
              ),
          lifeDate,
          lifeCursor,
          notExists(
            this.database
              .select({ id: friendships.id })
              .from(friendships)
              .where(
                and(
                  eq(friendships.status, 'blocked'),
                  or(
                    and(
                      eq(friendships.userLowId, userId),
                      eq(friendships.userHighId, lifeUpdates.authorUserId),
                    ),
                    and(
                      eq(friendships.userHighId, userId),
                      eq(friendships.userLowId, lifeUpdates.authorUserId),
                    ),
                  ),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(lifeUpdates.createdAt), desc(lifeUpdates.id))
      .limit(input.limit + 1);
    return [
      ...postRows.map((row) => ({ ...row, type: 'post' as const })),
      ...lifeRows.map((row) => ({ ...row, type: 'life_update' as const })),
    ]
      .sort(compareReferences)
      .slice(0, input.limit + 1);
  }

  private async mapPage(
    userId: UserId,
    references: MemoryReference[],
    limit: number,
  ): Promise<MemoryPage> {
    const hasMore = references.length > limit;
    const page = hasMore ? references.slice(0, limit) : references;
    const items = await Promise.all(
      page.map(async (reference): Promise<MemoryItem> =>
        reference.type === 'post'
          ? {
              type: 'post',
              occurredAt: reference.occurredAt.toISOString(),
              post: await this.postService.get(userId, reference.id as PostId),
            }
          : {
              type: 'life_update',
              occurredAt: reference.occurredAt.toISOString(),
              lifeUpdate: await this.lifeUpdateService.get(
                userId,
                reference.id as LifeUpdateId,
              ),
            },
      ),
    );
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodePostCursor(last.occurredAt, last.id as PostId)
          : null,
    };
  }
}

function period(year: number, month?: number) {
  const start = new Date(Date.UTC(year, month ? month - 1 : 0, 1));
  const end = month
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1));
  return { start, end };
}

function compareReferences(
  left: MemoryReference,
  right: MemoryReference,
): number {
  return (
    right.occurredAt.getTime() - left.occurredAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
