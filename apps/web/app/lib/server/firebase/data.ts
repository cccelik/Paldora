import { ApiClientError } from '@/lib/server/web-data-error';
import { firebaseSessionUid } from './session';
import { WebDataContext } from './data-context';
import { AccountModerationData } from './data-account';
import { NotificationsMediaData } from './data-notifications-media';
import { RoomsSocialData } from './data-rooms-social';
import { BoxesData } from './data-boxes';
import { LifeUpdatesData } from './data-life-updates';
import { PostsData } from './data-posts';
import { CommentsData } from './data-comments';
import 'server-only';

export type {
  FirebaseFeedItem,
  FirebaseCommentItem,
  FirebaseThreadItem,
  FirebaseCommentThread,
  FirebaseLifeUpdateItem,
} from './data-views';

/** Firebase-only web data access, always scoped to a verified cookie. */
export class FirebaseWebData {
  private readonly accountModerationData: AccountModerationData;
  private readonly notificationsMediaData: NotificationsMediaData;
  private readonly roomsSocialData: RoomsSocialData;
  private readonly boxesData: BoxesData;
  private readonly lifeUpdatesData: LifeUpdatesData;
  private readonly postsData: PostsData;
  private readonly commentsData: CommentsData;

  public constructor(uid: string) {
    const ctx = new WebDataContext(uid);
    this.accountModerationData = new AccountModerationData(ctx);
    this.notificationsMediaData = new NotificationsMediaData(ctx);
    this.roomsSocialData = new RoomsSocialData(ctx);
    this.boxesData = new BoxesData(ctx);
    this.lifeUpdatesData = new LifeUpdatesData(ctx);
    this.postsData = new PostsData(ctx);
    this.commentsData = new CommentsData(ctx);
  }

  public accountExport(
    ...args: Parameters<AccountModerationData['accountExport']>
  ): ReturnType<AccountModerationData['accountExport']> {
    return this.accountModerationData.accountExport(...args);
  }

  public requestAccountExport(
    ...args: Parameters<AccountModerationData['requestAccountExport']>
  ): ReturnType<AccountModerationData['requestAccountExport']> {
    return this.accountModerationData.requestAccountExport(...args);
  }

  public accountDeletion(
    ...args: Parameters<AccountModerationData['accountDeletion']>
  ): ReturnType<AccountModerationData['accountDeletion']> {
    return this.accountModerationData.accountDeletion(...args);
  }

  public requestAccountDeletion(
    ...args: Parameters<AccountModerationData['requestAccountDeletion']>
  ): ReturnType<AccountModerationData['requestAccountDeletion']> {
    return this.accountModerationData.requestAccountDeletion(...args);
  }

  public cancelAccountDeletion(
    ...args: Parameters<AccountModerationData['cancelAccountDeletion']>
  ): ReturnType<AccountModerationData['cancelAccountDeletion']> {
    return this.accountModerationData.cancelAccountDeletion(...args);
  }

  public downloadAccountExport(
    ...args: Parameters<AccountModerationData['downloadAccountExport']>
  ): ReturnType<AccountModerationData['downloadAccountExport']> {
    return this.accountModerationData.downloadAccountExport(...args);
  }

  public createReport(
    ...args: Parameters<AccountModerationData['createReport']>
  ): ReturnType<AccountModerationData['createReport']> {
    return this.accountModerationData.createReport(...args);
  }

  public myReports(
    ...args: Parameters<AccountModerationData['myReports']>
  ): ReturnType<AccountModerationData['myReports']> {
    return this.accountModerationData.myReports(...args);
  }

  public moderationCases(
    ...args: Parameters<AccountModerationData['moderationCases']>
  ): ReturnType<AccountModerationData['moderationCases']> {
    return this.accountModerationData.moderationCases(...args);
  }

  public moderationCase(
    ...args: Parameters<AccountModerationData['moderationCase']>
  ): ReturnType<AccountModerationData['moderationCase']> {
    return this.accountModerationData.moderationCase(...args);
  }

  public actOnModerationCase(
    ...args: Parameters<AccountModerationData['actOnModerationCase']>
  ): ReturnType<AccountModerationData['actOnModerationCase']> {
    return this.accountModerationData.actOnModerationCase(...args);
  }

  public moderationAccount(
    ...args: Parameters<AccountModerationData['moderationAccount']>
  ): ReturnType<AccountModerationData['moderationAccount']> {
    return this.accountModerationData.moderationAccount(...args);
  }

  public myModerationNotices(
    ...args: Parameters<AccountModerationData['myModerationNotices']>
  ): ReturnType<AccountModerationData['myModerationNotices']> {
    return this.accountModerationData.myModerationNotices(...args);
  }

  public notifications(
    ...args: Parameters<NotificationsMediaData['notifications']>
  ): ReturnType<NotificationsMediaData['notifications']> {
    return this.notificationsMediaData.notifications(...args);
  }

  public unreadNotificationCount(
    ...args: Parameters<NotificationsMediaData['unreadNotificationCount']>
  ): ReturnType<NotificationsMediaData['unreadNotificationCount']> {
    return this.notificationsMediaData.unreadNotificationCount(...args);
  }

  public markNotificationRead(
    ...args: Parameters<NotificationsMediaData['markNotificationRead']>
  ): ReturnType<NotificationsMediaData['markNotificationRead']> {
    return this.notificationsMediaData.markNotificationRead(...args);
  }

  public markAllNotificationsRead(
    ...args: Parameters<NotificationsMediaData['markAllNotificationsRead']>
  ): ReturnType<NotificationsMediaData['markAllNotificationsRead']> {
    return this.notificationsMediaData.markAllNotificationsRead(...args);
  }

  public createMediaUpload(
    ...args: Parameters<NotificationsMediaData['createMediaUpload']>
  ): ReturnType<NotificationsMediaData['createMediaUpload']> {
    return this.notificationsMediaData.createMediaUpload(...args);
  }

  public completeMediaUpload(
    ...args: Parameters<NotificationsMediaData['completeMediaUpload']>
  ): ReturnType<NotificationsMediaData['completeMediaUpload']> {
    return this.notificationsMediaData.completeMediaUpload(...args);
  }

  public mediaAsset(
    ...args: Parameters<NotificationsMediaData['mediaAsset']>
  ): ReturnType<NotificationsMediaData['mediaAsset']> {
    return this.notificationsMediaData.mediaAsset(...args);
  }

  public deleteAvatar(
    ...args: Parameters<NotificationsMediaData['deleteAvatar']>
  ): ReturnType<NotificationsMediaData['deleteAvatar']> {
    return this.notificationsMediaData.deleteAvatar(...args);
  }

  public myRoom(
    ...args: Parameters<RoomsSocialData['myRoom']>
  ): ReturnType<RoomsSocialData['myRoom']> {
    return this.roomsSocialData.myRoom(...args);
  }

  public room(
    ...args: Parameters<RoomsSocialData['room']>
  ): ReturnType<RoomsSocialData['room']> {
    return this.roomsSocialData.room(...args);
  }

  public updateMyRoom(
    ...args: Parameters<RoomsSocialData['updateMyRoom']>
  ): ReturnType<RoomsSocialData['updateMyRoom']> {
    return this.roomsSocialData.updateMyRoom(...args);
  }

  public updateMyRoomWidgets(
    ...args: Parameters<RoomsSocialData['updateMyRoomWidgets']>
  ): ReturnType<RoomsSocialData['updateMyRoomWidgets']> {
    return this.roomsSocialData.updateMyRoomWidgets(...args);
  }

  public updateMyRoomTopFriends(
    ...args: Parameters<RoomsSocialData['updateMyRoomTopFriends']>
  ): ReturnType<RoomsSocialData['updateMyRoomTopFriends']> {
    return this.roomsSocialData.updateMyRoomTopFriends(...args);
  }

  public myRoomPersonalization(
    ...args: Parameters<RoomsSocialData['myRoomPersonalization']>
  ): ReturnType<RoomsSocialData['myRoomPersonalization']> {
    return this.roomsSocialData.myRoomPersonalization(...args);
  }

  public roomPersonalization(
    ...args: Parameters<RoomsSocialData['roomPersonalization']>
  ): ReturnType<RoomsSocialData['roomPersonalization']> {
    return this.roomsSocialData.roomPersonalization(...args);
  }

  public updateMyRoomPersonalization(
    ...args: Parameters<RoomsSocialData['updateMyRoomPersonalization']>
  ): ReturnType<RoomsSocialData['updateMyRoomPersonalization']> {
    return this.roomsSocialData.updateMyRoomPersonalization(...args);
  }

  public myMemories(
    ...args: Parameters<RoomsSocialData['myMemories']>
  ): ReturnType<RoomsSocialData['myMemories']> {
    return this.roomsSocialData.myMemories(...args);
  }

  public myMemorySummary(
    ...args: Parameters<RoomsSocialData['myMemorySummary']>
  ): ReturnType<RoomsSocialData['myMemorySummary']> {
    return this.roomsSocialData.myMemorySummary(...args);
  }

  public boxMemories(
    ...args: Parameters<RoomsSocialData['boxMemories']>
  ): ReturnType<RoomsSocialData['boxMemories']> {
    return this.roomsSocialData.boxMemories(...args);
  }

  public boxMemorySummary(
    ...args: Parameters<RoomsSocialData['boxMemorySummary']>
  ): ReturnType<RoomsSocialData['boxMemorySummary']> {
    return this.roomsSocialData.boxMemorySummary(...args);
  }

  public roomContent(
    ...args: Parameters<RoomsSocialData['roomContent']>
  ): ReturnType<RoomsSocialData['roomContent']> {
    return this.roomsSocialData.roomContent(...args);
  }

  public roomContentSummary(
    ...args: Parameters<RoomsSocialData['roomContentSummary']>
  ): ReturnType<RoomsSocialData['roomContentSummary']> {
    return this.roomsSocialData.roomContentSummary(...args);
  }

  public roomPhotos(
    ...args: Parameters<RoomsSocialData['roomPhotos']>
  ): ReturnType<RoomsSocialData['roomPhotos']> {
    return this.roomsSocialData.roomPhotos(...args);
  }

  public friends(
    ...args: Parameters<RoomsSocialData['friends']>
  ): ReturnType<RoomsSocialData['friends']> {
    return this.roomsSocialData.friends(...args);
  }

  public friendRequests(
    ...args: Parameters<RoomsSocialData['friendRequests']>
  ): ReturnType<RoomsSocialData['friendRequests']> {
    return this.roomsSocialData.friendRequests(...args);
  }

  public sendFriendRequest(
    ...args: Parameters<RoomsSocialData['sendFriendRequest']>
  ): ReturnType<RoomsSocialData['sendFriendRequest']> {
    return this.roomsSocialData.sendFriendRequest(...args);
  }

  public acceptFriendRequest(
    ...args: Parameters<RoomsSocialData['acceptFriendRequest']>
  ): ReturnType<RoomsSocialData['acceptFriendRequest']> {
    return this.roomsSocialData.acceptFriendRequest(...args);
  }

  public declineFriendRequest(
    ...args: Parameters<RoomsSocialData['declineFriendRequest']>
  ): ReturnType<RoomsSocialData['declineFriendRequest']> {
    return this.roomsSocialData.declineFriendRequest(...args);
  }

  public cancelFriendRequest(
    ...args: Parameters<RoomsSocialData['cancelFriendRequest']>
  ): ReturnType<RoomsSocialData['cancelFriendRequest']> {
    return this.roomsSocialData.cancelFriendRequest(...args);
  }

  public removeFriend(
    ...args: Parameters<RoomsSocialData['removeFriend']>
  ): ReturnType<RoomsSocialData['removeFriend']> {
    return this.roomsSocialData.removeFriend(...args);
  }

  public blocks(
    ...args: Parameters<RoomsSocialData['blocks']>
  ): ReturnType<RoomsSocialData['blocks']> {
    return this.roomsSocialData.blocks(...args);
  }

  public block(
    ...args: Parameters<RoomsSocialData['block']>
  ): ReturnType<RoomsSocialData['block']> {
    return this.roomsSocialData.block(...args);
  }

  public unblock(
    ...args: Parameters<RoomsSocialData['unblock']>
  ): ReturnType<RoomsSocialData['unblock']> {
    return this.roomsSocialData.unblock(...args);
  }

  public setReactionPresets(
    ...args: Parameters<RoomsSocialData['setReactionPresets']>
  ): ReturnType<RoomsSocialData['setReactionPresets']> {
    return this.roomsSocialData.setReactionPresets(...args);
  }

  public boxes(
    ...args: Parameters<BoxesData['boxes']>
  ): ReturnType<BoxesData['boxes']> {
    return this.boxesData.boxes(...args);
  }

  public createBox(
    ...args: Parameters<BoxesData['createBox']>
  ): ReturnType<BoxesData['createBox']> {
    return this.boxesData.createBox(...args);
  }

  public box(
    ...args: Parameters<BoxesData['box']>
  ): ReturnType<BoxesData['box']> {
    return this.boxesData.box(...args);
  }

  public updateBox(
    ...args: Parameters<BoxesData['updateBox']>
  ): ReturnType<BoxesData['updateBox']> {
    return this.boxesData.updateBox(...args);
  }

  public deleteBox(
    ...args: Parameters<BoxesData['deleteBox']>
  ): ReturnType<BoxesData['deleteBox']> {
    return this.boxesData.deleteBox(...args);
  }

  public boxMembers(
    ...args: Parameters<BoxesData['boxMembers']>
  ): ReturnType<BoxesData['boxMembers']> {
    return this.boxesData.boxMembers(...args);
  }

  public setBoxMemberRole(
    ...args: Parameters<BoxesData['setBoxMemberRole']>
  ): ReturnType<BoxesData['setBoxMemberRole']> {
    return this.boxesData.setBoxMemberRole(...args);
  }

  public removeBoxMember(
    ...args: Parameters<BoxesData['removeBoxMember']>
  ): ReturnType<BoxesData['removeBoxMember']> {
    return this.boxesData.removeBoxMember(...args);
  }

  public leaveBox(
    ...args: Parameters<BoxesData['leaveBox']>
  ): ReturnType<BoxesData['leaveBox']> {
    return this.boxesData.leaveBox(...args);
  }

  public transferBoxOwnership(
    ...args: Parameters<BoxesData['transferBoxOwnership']>
  ): ReturnType<BoxesData['transferBoxOwnership']> {
    return this.boxesData.transferBoxOwnership(...args);
  }

  public inviteToBox(
    ...args: Parameters<BoxesData['inviteToBox']>
  ): ReturnType<BoxesData['inviteToBox']> {
    return this.boxesData.inviteToBox(...args);
  }

  public revokeBoxInvitation(
    ...args: Parameters<BoxesData['revokeBoxInvitation']>
  ): ReturnType<BoxesData['revokeBoxInvitation']> {
    return this.boxesData.revokeBoxInvitation(...args);
  }

  public acceptBoxInvitation(
    ...args: Parameters<BoxesData['acceptBoxInvitation']>
  ): ReturnType<BoxesData['acceptBoxInvitation']> {
    return this.boxesData.acceptBoxInvitation(...args);
  }

  public declineBoxInvitation(
    ...args: Parameters<BoxesData['declineBoxInvitation']>
  ): ReturnType<BoxesData['declineBoxInvitation']> {
    return this.boxesData.declineBoxInvitation(...args);
  }

  public myBoxInvitations(
    ...args: Parameters<BoxesData['myBoxInvitations']>
  ): ReturnType<BoxesData['myBoxInvitations']> {
    return this.boxesData.myBoxInvitations(...args);
  }

  public boxInvitations(
    ...args: Parameters<BoxesData['boxInvitations']>
  ): ReturnType<BoxesData['boxInvitations']> {
    return this.boxesData.boxInvitations(...args);
  }

  public myLifeUpdates(
    ...args: Parameters<LifeUpdatesData['myLifeUpdates']>
  ): ReturnType<LifeUpdatesData['myLifeUpdates']> {
    return this.lifeUpdatesData.myLifeUpdates(...args);
  }

  public lifeUpdate(
    ...args: Parameters<LifeUpdatesData['lifeUpdate']>
  ): ReturnType<LifeUpdatesData['lifeUpdate']> {
    return this.lifeUpdatesData.lifeUpdate(...args);
  }

  public createLifeUpdate(
    ...args: Parameters<LifeUpdatesData['createLifeUpdate']>
  ): ReturnType<LifeUpdatesData['createLifeUpdate']> {
    return this.lifeUpdatesData.createLifeUpdate(...args);
  }

  public deleteLifeUpdate(
    ...args: Parameters<LifeUpdatesData['deleteLifeUpdate']>
  ): ReturnType<LifeUpdatesData['deleteLifeUpdate']> {
    return this.lifeUpdatesData.deleteLifeUpdate(...args);
  }

  public editLifeUpdate(
    ...args: Parameters<LifeUpdatesData['editLifeUpdate']>
  ): ReturnType<LifeUpdatesData['editLifeUpdate']> {
    return this.lifeUpdatesData.editLifeUpdate(...args);
  }

  public boxPosts(
    ...args: Parameters<PostsData['boxPosts']>
  ): ReturnType<PostsData['boxPosts']> {
    return this.postsData.boxPosts(...args);
  }

  public postInteractionSummary(
    ...args: Parameters<PostsData['postInteractionSummary']>
  ): ReturnType<PostsData['postInteractionSummary']> {
    return this.postsData.postInteractionSummary(...args);
  }

  public postReactions(
    ...args: Parameters<PostsData['postReactions']>
  ): ReturnType<PostsData['postReactions']> {
    return this.postsData.postReactions(...args);
  }

  public homeFeed(
    ...args: Parameters<PostsData['homeFeed']>
  ): ReturnType<PostsData['homeFeed']> {
    return this.postsData.homeFeed(...args);
  }

  public post(
    ...args: Parameters<PostsData['post']>
  ): ReturnType<PostsData['post']> {
    return this.postsData.post(...args);
  }

  public createPost(
    ...args: Parameters<PostsData['createPost']>
  ): ReturnType<PostsData['createPost']> {
    return this.postsData.createPost(...args);
  }

  public updatePost(
    ...args: Parameters<PostsData['updatePost']>
  ): ReturnType<PostsData['updatePost']> {
    return this.postsData.updatePost(...args);
  }

  public deletePost(
    ...args: Parameters<PostsData['deletePost']>
  ): ReturnType<PostsData['deletePost']> {
    return this.postsData.deletePost(...args);
  }

  public setPostReaction(
    ...args: Parameters<PostsData['setPostReaction']>
  ): ReturnType<PostsData['setPostReaction']> {
    return this.postsData.setPostReaction(...args);
  }

  public comments(
    ...args: Parameters<CommentsData['comments']>
  ): ReturnType<CommentsData['comments']> {
    return this.commentsData.comments(...args);
  }

  public commentThreads(
    ...args: Parameters<CommentsData['commentThreads']>
  ): ReturnType<CommentsData['commentThreads']> {
    return this.commentsData.commentThreads(...args);
  }

  public moreCommentReplies(
    ...args: Parameters<CommentsData['moreCommentReplies']>
  ): ReturnType<CommentsData['moreCommentReplies']> {
    return this.commentsData.moreCommentReplies(...args);
  }

  public pinnedCommentThread(
    ...args: Parameters<CommentsData['pinnedCommentThread']>
  ): ReturnType<CommentsData['pinnedCommentThread']> {
    return this.commentsData.pinnedCommentThread(...args);
  }

  public createComment(
    ...args: Parameters<CommentsData['createComment']>
  ): ReturnType<CommentsData['createComment']> {
    return this.commentsData.createComment(...args);
  }

  public setCommentReaction(
    ...args: Parameters<CommentsData['setCommentReaction']>
  ): ReturnType<CommentsData['setCommentReaction']> {
    return this.commentsData.setCommentReaction(...args);
  }

  public deleteComment(
    ...args: Parameters<CommentsData['deleteComment']>
  ): ReturnType<CommentsData['deleteComment']> {
    return this.commentsData.deleteComment(...args);
  }

  public editComment(
    ...args: Parameters<CommentsData['editComment']>
  ): ReturnType<CommentsData['editComment']> {
    return this.commentsData.editComment(...args);
  }
}

export async function firebaseWebData(): Promise<FirebaseWebData> {
  const uid = await firebaseSessionUid();
  if (!uid)
    throw new ApiClientError(401, 'AUTHENTICATION_REQUIRED', 'Sign in.', null);
  return new FirebaseWebData(uid);
}
