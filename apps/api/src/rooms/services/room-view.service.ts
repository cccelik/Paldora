import { Inject, Injectable } from '@nestjs/common';
import type { PaldoraDatabase } from '@paldora/database';
import type { RoomView, UserSummary } from '@paldora/validation';
import { ProfileSummaryService } from '../../identity/profile-summary.service.js';
import { MediaUrlService } from '../../media/media-urls.service.js';
import { DATABASE } from '../../platform/config/tokens.js';
import { RoomAccessService, type RoomAccess } from './room-access.service.js';
import { storedWidgets } from '../records/room-records.js';
import { visibleTopFriendIds } from '../records/room-top-friends-read.js';
import { mayViewTopFriends, toRoomView } from '../records/room-views.js';

/**
 * Builds the Room response after access was decided. A fixed number of
 * queries whatever the Room holds: widgets, Top Friends, and their
 * summaries (the access query already brought the owner, the settings, and
 * the avatar and banner keys). Everything is signed only now, after access.
 */
@Injectable()
export class RoomViewService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(RoomAccessService) private readonly access: RoomAccessService,
    @Inject(ProfileSummaryService)
    private readonly summaries: ProfileSummaryService,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
  ) {}

  /** `GET /rooms/{username}`: any denial is ROOM_NOT_FOUND. */
  public async forViewer(
    viewerId: string,
    rawUsername: string,
  ): Promise<RoomView> {
    return this.render(await this.access.resolve(viewerId, rawUsername));
  }

  /** `GET /me/room`, and the response of every Room write. */
  public async forOwner(userId: string): Promise<RoomView> {
    return this.render(await this.access.own(userId));
  }

  private async render(access: RoomAccess): Promise<RoomView> {
    const ownerId = access.owner.id;
    const topFriendsVisible = mayViewTopFriends(
      access.room.settings.topFriendsVisibility,
      access.relationship,
    );
    const [widgets, topFriends, avatarUrl, banner] = await Promise.all([
      storedWidgets(this.database, ownerId),
      topFriendsVisible
        ? this.topFriendsFor(ownerId, access.viewerId)
        : Promise.resolve(null),
      this.mediaUrls.signThumbnail(access.owner.avatar),
      this.mediaUrls.sign(access.banner),
    ]);
    return toRoomView({
      relationship: access.relationship,
      owner: {
        id: ownerId,
        username: access.owner.username,
        displayName: access.owner.displayName,
        bio: access.owner.bio,
        avatarUrl,
      },
      room: access.room,
      widgets,
      topFriends,
      bannerUrl: banner?.url ?? null,
    });
  }

  private async topFriendsFor(
    ownerId: string,
    viewerId: string,
  ): Promise<UserSummary[]> {
    const ids = await visibleTopFriendIds(this.database, ownerId, viewerId);
    const summaries = await this.summaries.summaries(ids);
    return ids.flatMap((id) => {
      const summary = summaries.get(id);
      return summary ? [summary] : [];
    });
  }
}
