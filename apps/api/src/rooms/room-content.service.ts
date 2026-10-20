import { Inject, Injectable } from '@nestjs/common';
import type {
  MemoryItemView,
  MemorySummaryView,
  RoomContentQuery,
  RoomPhotoQuery,
  RoomPhotoView,
} from '@paldora/validation';
import {
  MemoryQueryService,
  type MemoryPageScope,
} from '../memories/memory-query.service.js';
import { MemorySummaryService } from '../memories/memory-summary.service.js';
import type { Page } from '../platform/pagination.js';
import { RoomAccessService } from './room-access.service.js';
import { isShareable, toRoomPhotos } from './room-content-views.js';

/**
 * Room previews (plan B1, §D "Room previews"): the owner's content that the
 * viewer can reach today. Every route decides Room access first, so any
 * denial is the shared ROOM_NOT_FOUND. Then the content comes through the
 * Memories candidates with the owner as the only author: they start from
 * the viewer's current memberships, drop blocked authors, deleted posts and
 * Life Updates, and (here) every Only Me Life Update. Items are loaded and
 * re-authorized by the Memories page, which signs photos only for what
 * survives. No query here reads posts directly, and nothing is counted or
 * hinted about what the viewer cannot see.
 *
 * Widget switches are presentation: these routes answer the same whether a
 * widget is on or off, so they reveal nothing about the owner's layout.
 */
@Injectable()
export class RoomContentService {
  public constructor(
    @Inject(RoomAccessService) private readonly access: RoomAccessService,
    @Inject(MemoryQueryService) private readonly memories: MemoryQueryService,
    @Inject(MemorySummaryService)
    private readonly summaries: MemorySummaryService,
  ) {}

  /** `GET /rooms/{username}/content`. */
  public async content(
    viewerId: string,
    rawUsername: string,
    query: RoomContentQuery,
  ): Promise<Page<MemoryItemView>> {
    const scope = await this.scope(viewerId, rawUsername);
    const page = await this.memories.page(viewerId, scope, query);
    return { ...page, items: page.items.filter(isShareable) };
  }

  /** `GET /rooms/{username}/content/summary`: counts over `content`. */
  public async summary(
    viewerId: string,
    rawUsername: string,
    year: number | undefined,
  ): Promise<MemorySummaryView> {
    const scope = await this.scope(viewerId, rawUsername);
    return this.summaries.summary(viewerId, scope, year);
  }

  /**
   * `GET /rooms/{username}/photos`: a page of the items that carry a ready
   * photo, expanded to their photos. The cursor is the item keyset.
   */
  public async photos(
    viewerId: string,
    rawUsername: string,
    query: RoomPhotoQuery,
  ): Promise<Page<RoomPhotoView>> {
    const scope = await this.scope(viewerId, rawUsername);
    const page = await this.memories.page(
      viewerId,
      { ...scope, withPhotos: true },
      { ...query, type: 'all' },
    );
    return { items: toRoomPhotos(page.items), nextCursor: page.nextCursor };
  }

  private async scope(
    viewerId: string,
    rawUsername: string,
  ): Promise<MemoryPageScope> {
    const { owner } = await this.access.resolve(viewerId, rawUsername);
    return { authorId: owner.id, includeOnlyMe: false };
  }
}
