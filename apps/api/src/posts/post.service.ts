import { Inject, Injectable } from '@nestjs/common';
import { boxes, posts, type PaldoraDatabase } from '@paldora/database';
import type { PostView } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { boxArchived } from '../boxes/box-errors.js';
import { BoxPolicyService } from '../boxes/box-policy.service.js';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { boxChannel, RealtimeBus } from '../realtime/realtime-bus.js';
import { postAccessDenied, postNotFound } from './post-errors.js';
import { loadPostContext, PostQueryService } from './post-query.service.js';
import { toPostView } from './post-views.js';

@Injectable()
export class PostService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
    @Inject(BoxPolicyService) private readonly policy: BoxPolicyService,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
  ) {}

  private get database(): PaldoraDatabase {
    return this.infrastructure.database;
  }

  /** The Box row is locked `FOR SHARE`, so archiving cannot slip in between. */
  public async create(
    authorId: string,
    boxId: string,
    content: string,
  ): Promise<PostView> {
    const created = await this.database.transaction(async (transaction) => {
      await this.policy.membership(authorId, boxId, transaction);
      const [box] = await transaction
        .select({ status: boxes.status })
        .from(boxes)
        .where(eq(boxes.id, boxId))
        .for('share')
        .limit(1);
      if (box?.status !== 'active') throw boxArchived();
      const [post] = await transaction
        .insert(posts)
        .values({ boxId, authorUserId: authorId, content })
        .returning({ id: posts.id });
      return post;
    });
    if (!created) throw new Error('Post insert returned no row.');
    await this.announce('post.created', boxId, created.id);
    const { context, author } = await this.queries.get(authorId, created.id);
    return toPostView(context, author, authorId);
  }

  public async update(
    viewerId: string,
    postId: string,
    content: string,
  ): Promise<PostView> {
    const { context } = await this.queries.get(viewerId, postId);
    this.assertMayChange(
      context.post.authorUserId,
      viewerId,
      context.boxStatus,
    );
    const changed = await this.database
      .update(posts)
      .set({ content, editedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.authorUserId, viewerId),
          eq(posts.status, 'active'),
        ),
      )
      .returning({ id: posts.id });
    // Deleted between the read and the write: the post is gone.
    if (changed.length === 0) throw postNotFound();
    await this.announce('post.updated', context.post.boxId, postId);
    const fresh = await this.queries.get(viewerId, postId);
    return toPostView(fresh.context, fresh.author, viewerId);
  }

  /** Idempotent for the author: deleting a deleted post succeeds. */
  public async remove(viewerId: string, postId: string): Promise<void> {
    const context = await loadPostContext(this.database, viewerId, postId);
    if (!context || context.hidden) throw postNotFound();
    if (context.post.status === 'deleted') {
      if (context.post.authorUserId === viewerId) return;
      throw postNotFound();
    }
    this.assertMayChange(
      context.post.authorUserId,
      viewerId,
      context.boxStatus,
    );
    await this.database
      .update(posts)
      .set({
        status: 'deleted',
        content: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, postId), eq(posts.status, 'active')));
    await this.announce('post.deleted', context.post.boxId, postId);
  }

  /** After commit and best effort: the hint carries IDs, never content. */
  private announce(
    type: 'post.created' | 'post.updated' | 'post.deleted',
    boxId: string,
    postId: string,
  ): Promise<void> {
    return this.bus.publish(boxChannel(boxId), { type, boxId, postId });
  }

  private assertMayChange(
    authorId: string,
    viewerId: string,
    boxStatus: string,
  ): void {
    if (authorId !== viewerId) throw postAccessDenied();
    if (boxStatus !== 'active') throw boxArchived();
  }
}
