import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  boxMemberships,
  boxes,
  friendships,
  posts,
  type PaldoraDatabase,
} from '@paldora/database';
import type { BoxId, PostId, UserId } from '@paldora/domain';
import { and, eq } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';

@Injectable()
export class InteractionAuthorizationPolicy {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async requireVisiblePost(userId: UserId, postId: PostId) {
    const [post] = await this.database
      .select({
        id: posts.id,
        boxId: posts.boxId,
        authorUserId: posts.authorUserId,
        boxStatus: boxes.status,
      })
      .from(posts)
      .innerJoin(boxes, eq(boxes.id, posts.boxId))
      .innerJoin(
        boxMemberships,
        and(
          eq(boxMemberships.boxId, posts.boxId),
          eq(boxMemberships.userId, userId),
          eq(boxMemberships.status, 'active'),
        ),
      )
      .where(and(eq(posts.id, postId), eq(posts.status, 'active')))
      .limit(1);
    if (!post) this.notFound();
    return {
      ...post,
      id: post.id as PostId,
      boxId: post.boxId as BoxId,
      authorUserId: post.authorUserId as UserId,
    };
  }

  public async requirePostInteraction(userId: UserId, postId: PostId) {
    const post = await this.requireVisiblePost(userId, postId);
    if (post.boxStatus !== 'active') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'BOX_ARCHIVED',
        'Archived Boxes cannot accept new interactions.',
      );
    }
    await this.requireUsersCanInteract(userId, post.authorUserId);
    return post;
  }

  public async requireUsersCanInteract(
    firstUserId: UserId,
    secondUserId: UserId,
  ): Promise<void> {
    if (firstUserId === secondUserId) return;
    const low = firstUserId < secondUserId ? firstUserId : secondUserId;
    const high = firstUserId < secondUserId ? secondUserId : firstUserId;
    const [relationship] = await this.database
      .select({ status: friendships.status })
      .from(friendships)
      .where(
        and(eq(friendships.userLowId, low), eq(friendships.userHighId, high)),
      )
      .limit(1);
    if (relationship?.status === 'blocked') {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'INTERACTION_BLOCKED',
        'This interaction is not available.',
      );
    }
  }

  public notFound(): never {
    throw new ApiError(
      HttpStatus.NOT_FOUND,
      'POST_NOT_FOUND',
      'That post is unavailable.',
    );
  }
}
