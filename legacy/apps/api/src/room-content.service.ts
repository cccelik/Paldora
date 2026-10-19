import { Inject, Injectable } from '@nestjs/common';
import type {
  FeedItem,
  LifeUpdatePage,
  MemoryPage,
  PostId,
  PostPage,
  RoomGalleryPage,
  RoomGalleryItem,
  UserId,
} from '@paldora/domain';
import { LifeUpdateService } from './life-update.service.js';
import { encodePostCursor } from './post-cursor.js';
import { PostService } from './post.service.js';
import { RoomAuthorizationPolicy } from './room-authorization-policy.service.js';

interface PageInput {
  cursor?: string | undefined;
  limit: number;
}

@Injectable()
export class RoomContentService {
  public constructor(
    @Inject(RoomAuthorizationPolicy)
    private readonly policy: RoomAuthorizationPolicy,
    @Inject(PostService) private readonly postsService: PostService,
    @Inject(LifeUpdateService)
    private readonly lifeUpdatesService: LifeUpdateService,
  ) {}

  public async posts(
    viewerUserId: UserId,
    username: string,
    input: PageInput,
  ): Promise<PostPage> {
    const access = await this.policy.requireVisible(viewerUserId, username);
    return this.postsService.listUser(
      viewerUserId,
      access.room.userId as UserId,
      input,
    );
  }

  public async lifeUpdates(
    viewerUserId: UserId,
    username: string,
    input: PageInput,
  ): Promise<LifeUpdatePage> {
    await this.policy.requireVisible(viewerUserId, username);
    return this.lifeUpdatesService.listUser(viewerUserId, username, input);
  }

  public async gallery(
    viewerUserId: UserId,
    username: string,
    input: PageInput,
  ): Promise<RoomGalleryPage> {
    const feed = await this.feed(viewerUserId, username, input);
    return {
      items: feed.items.flatMap<RoomGalleryItem>((item) =>
        item.type === 'standard'
          ? item.post.media.map((media) => ({
              media,
              postId: item.post.id,
              lifeUpdateId: null,
              occurredAt: item.occurredAt,
            }))
          : item.lifeUpdate.media.map((media) => ({
              media,
              postId: item.lifeUpdate.contexts[0]!.postId,
              lifeUpdateId: item.lifeUpdate.id,
              occurredAt: item.occurredAt,
            })),
      ),
      nextCursor: feed.nextCursor,
    };
  }

  public async memories(
    viewerUserId: UserId,
    username: string,
    input: PageInput,
  ): Promise<MemoryPage> {
    const feed = await this.feed(viewerUserId, username, input);
    return {
      items: feed.items.map((item) =>
        item.type === 'standard'
          ? { type: 'post', occurredAt: item.occurredAt, post: item.post }
          : {
              type: 'life_update',
              occurredAt: item.occurredAt,
              lifeUpdate: item.lifeUpdate,
            },
      ),
      nextCursor: feed.nextCursor,
    };
  }

  private async feed(
    viewerUserId: UserId,
    username: string,
    input: PageInput,
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    const [postPage, lifePage] = await Promise.all([
      this.posts(viewerUserId, username, input),
      this.lifeUpdates(viewerUserId, username, input),
    ]);
    const combined: FeedItem[] = [
      ...postPage.items.map((post) => ({
        type: 'standard' as const,
        occurredAt: post.createdAt,
        post,
      })),
      ...lifePage.items.map((lifeUpdate) => ({
        type: 'life_update' as const,
        occurredAt: lifeUpdate.createdAt,
        lifeUpdate,
      })),
    ].sort(compareFeedItems);
    const items = combined.slice(0, input.limit);
    const last = items.at(-1);
    const hasMore =
      combined.length > input.limit ||
      postPage.nextCursor !== null ||
      lifePage.nextCursor !== null;
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodePostCursor(
              new Date(last.occurredAt),
              (last.type === 'standard'
                ? last.post.id
                : last.lifeUpdate.id) as unknown as PostId,
            )
          : null,
    };
  }
}

function compareFeedItems(left: FeedItem, right: FeedItem): number {
  const time = right.occurredAt.localeCompare(left.occurredAt);
  if (time !== 0) return time;
  const leftId = left.type === 'standard' ? left.post.id : left.lifeUpdate.id;
  const rightId =
    right.type === 'standard' ? right.post.id : right.lifeUpdate.id;
  return rightId.localeCompare(leftId);
}
