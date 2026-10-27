import Foundation

/// One contract per callable. `Contracts.all` is what the conformance tests walk.
public enum Contracts {
    public enum BeginBoxDeletion: CallableContract { public typealias Request = BeginBoxDeletionRequest; public typealias Response = BeginBoxDeletionResponse; public static let name = CallableName.beginBoxDeletion }
    public enum BoxDeletionStatus: CallableContract { public typealias Request = BoxReference; public typealias Response = BoxDeletionProgress; public static let name = CallableName.boxDeletionStatus }
    public enum CreateLifeUpdate: CallableContract { public typealias Request = CreateLifeUpdateRequest; public typealias Response = CreateLifeUpdateResponse; public static let name = CallableName.createLifeUpdate }
    public enum GetLifeUpdate: CallableContract { public typealias Request = LifeUpdateReference; public typealias Response = LifeUpdate; public static let name = CallableName.getLifeUpdate }
    public enum ListMyLifeUpdates: CallableContract { public typealias Request = CursorRequest; public typealias Response = Page<LifeUpdate>; public static let name = CallableName.listMyLifeUpdates }
    public enum EditLifeUpdate: CallableContract { public typealias Request = EditLifeUpdateRequest; public typealias Response = OkResponse; public static let name = CallableName.editLifeUpdate }
    public enum DeleteLifeUpdate: CallableContract { public typealias Request = LifeUpdateReference; public typealias Response = OkResponse; public static let name = CallableName.deleteLifeUpdate }
    public enum InviteBox: CallableContract { public typealias Request = InviteBoxRequest; public typealias Response = InviteBoxResponse; public static let name = CallableName.inviteBox }
    public enum ProvisionMyAccount: CallableContract { public typealias Request = EmptyRequest; public typealias Response = OkResponse; public static let name = CallableName.provisionMyAccount }
    public enum SendFriendRequest: CallableContract { public typealias Request = SendFriendRequestRequest; public typealias Response = SendFriendRequestResponse; public static let name = CallableName.sendFriendRequest }
    public enum AcceptFriendRequest: CallableContract { public typealias Request = FriendRequestReference; public typealias Response = OkResponse; public static let name = CallableName.acceptFriendRequest }
    public enum CloseFriendship: CallableContract { public typealias Request = FriendRequestReference; public typealias Response = OkResponse; public static let name = CallableName.closeFriendship }
    public enum ListMyFriendships: CallableContract { public typealias Request = ListMyFriendshipsRequest; public typealias Response = Page<Friendship>; public static let name = CallableName.listMyFriendships }
    public enum ListMyBoxInvitations: CallableContract { public typealias Request = CursorRequest; public typealias Response = Page<MyBoxInvitation>; public static let name = CallableName.listMyBoxInvitations }
    public enum ListBoxInvitations: CallableContract { public typealias Request = ListBoxInvitationsRequest; public typealias Response = Page<BoxInvitation>; public static let name = CallableName.listBoxInvitations }
    public enum ListBoxMembers: CallableContract { public typealias Request = ListBoxMembersRequest; public typealias Response = Page<BoxMember>; public static let name = CallableName.listBoxMembers }
    public enum AcceptBoxInvitation: CallableContract { public typealias Request = InvitationReference; public typealias Response = AcceptBoxInvitationResponse; public static let name = CallableName.acceptBoxInvitation }
    public enum DeclineBoxInvitation: CallableContract { public typealias Request = InvitationReference; public typealias Response = OkResponse; public static let name = CallableName.declineBoxInvitation }
    public enum RevokeBoxInvitation: CallableContract { public typealias Request = RevokeBoxInvitationRequest; public typealias Response = OkResponse; public static let name = CallableName.revokeBoxInvitation }
    public enum ReserveUsername: CallableContract { public typealias Request = ReserveUsernameRequest; public typealias Response = ReserveUsernameResponse; public static let name = CallableName.reserveUsername }
    public enum CreateBoxPost: CallableContract { public typealias Request = CreateBoxPostRequest; public typealias Response = CreateBoxPostResponse; public static let name = CallableName.createBoxPost }
    public enum GetBoxPost: CallableContract { public typealias Request = PostReference; public typealias Response = BoxPost; public static let name = CallableName.getBoxPost }
    public enum ListBoxPosts: CallableContract { public typealias Request = ListBoxPostsRequest; public typealias Response = Page<BoxPost>; public static let name = CallableName.listBoxPosts }
    public enum EditBoxPost: CallableContract { public typealias Request = EditBoxPostRequest; public typealias Response = OkResponse; public static let name = CallableName.editBoxPost }
    public enum DeleteBoxPost: CallableContract { public typealias Request = PostReference; public typealias Response = OkResponse; public static let name = CallableName.deleteBoxPost }
    public enum ListMyBlocks: CallableContract { public typealias Request = CursorRequest; public typealias Response = Page<BlockedUser>; public static let name = CallableName.listMyBlocks }
    public enum SetUserBlock: CallableContract { public typealias Request = SetUserBlockRequest; public typealias Response = OkResponse; public static let name = CallableName.setUserBlock }
    public enum CreateBoxComment: CallableContract { public typealias Request = CreateBoxCommentRequest; public typealias Response = CreateBoxCommentResponse; public static let name = CallableName.createBoxComment }
    public enum ListBoxComments: CallableContract { public typealias Request = ListBoxCommentsRequest; public typealias Response = Page<BoxComment>; public static let name = CallableName.listBoxComments }
    public enum EditBoxComment: CallableContract { public typealias Request = EditBoxCommentRequest; public typealias Response = OkResponse; public static let name = CallableName.editBoxComment }
    public enum DeleteBoxComment: CallableContract { public typealias Request = DeleteBoxCommentRequest; public typealias Response = OkResponse; public static let name = CallableName.deleteBoxComment }
    public enum SetBoxReaction: CallableContract { public typealias Request = SetBoxReactionRequest; public typealias Response = OkResponse; public static let name = CallableName.setBoxReaction }
    public enum ListBoxReactions: CallableContract { public typealias Request = ListBoxReactionsRequest; public typealias Response = Page<BoxReaction>; public static let name = CallableName.listBoxReactions }
    public enum ReportBoxPost: CallableContract { public typealias Request = ReportBoxPostRequest; public typealias Response = ReportBoxPostResponse; public static let name = CallableName.reportBoxPost }
    public enum ListModerationReports: CallableContract { public typealias Request = CursorRequest; public typealias Response = Page<ModerationReport>; public static let name = CallableName.listModerationReports }
    public enum HideReportedPost: CallableContract { public typealias Request = HideReportedPostRequest; public typealias Response = OkResponse; public static let name = CallableName.hideReportedPost }
    public enum GetMyProfile: CallableContract { public typealias Request = EmptyRequest; public typealias Response = MyProfile; public static let name = CallableName.getMyProfile }
    public enum UpdateMyProfile: CallableContract { public typealias Request = UpdateMyProfileRequest; public typealias Response = MyProfile; public static let name = CallableName.updateMyProfile }
    public enum UpdateMyPreferences: CallableContract { public typealias Request = UpdateMyPreferencesRequest; public typealias Response = Preferences; public static let name = CallableName.updateMyPreferences }
    public enum ListMyBoxes: CallableContract { public typealias Request = CursorRequest; public typealias Response = Page<Box>; public static let name = CallableName.listMyBoxes }
    public enum CreateBox: CallableContract { public typealias Request = CreateBoxRequest; public typealias Response = Box; public static let name = CallableName.createBox }
    public enum GetBox: CallableContract { public typealias Request = BoxReference; public typealias Response = Box; public static let name = CallableName.getBox }
    public enum ListMyNotifications: CallableContract { public typealias Request = CursorRequest; public typealias Response = NotificationPage; public static let name = CallableName.listMyNotifications }
    public enum CountMyUnreadNotifications: CallableContract { public typealias Request = EmptyRequest; public typealias Response = UnreadCount; public static let name = CallableName.countMyUnreadNotifications }
    public enum MarkNotificationRead: CallableContract { public typealias Request = NotificationReference; public typealias Response = PaldoraNotification; public static let name = CallableName.markNotificationRead }
    public enum MarkAllNotificationsRead: CallableContract { public typealias Request = EmptyRequest; public typealias Response = OkResponse; public static let name = CallableName.markAllNotificationsRead }
    public enum GetHomeFeed: CallableContract { public typealias Request = CursorRequest; public typealias Response = Page<FeedItem>; public static let name = CallableName.getHomeFeed }
    public enum CreateMediaUpload: CallableContract { public typealias Request = CreateMediaUploadRequest; public typealias Response = CreateMediaUploadResponse; public static let name = CallableName.createMediaUpload }
    public enum CompleteMediaUpload: CallableContract { public typealias Request = MediaAssetReference; public typealias Response = MediaAsset; public static let name = CallableName.completeMediaUpload }
    public enum GetMediaAsset: CallableContract { public typealias Request = MediaAssetReference; public typealias Response = MediaAssetDetails; public static let name = CallableName.getMediaAsset }
    public enum GetMyRoom: CallableContract { public typealias Request = EmptyRequest; public typealias Response = Room; public static let name = CallableName.getMyRoom }
    public enum GetRoom: CallableContract { public typealias Request = RoomReference; public typealias Response = Room; public static let name = CallableName.getRoom }
    public enum UpdateMyRoom: CallableContract { public typealias Request = UpdateMyRoomRequest; public typealias Response = Room; public static let name = CallableName.updateMyRoom }
    public enum UpdateMyRoomWidgets: CallableContract { public typealias Request = UpdateMyRoomWidgetsRequest; public typealias Response = Room; public static let name = CallableName.updateMyRoomWidgets }
    public enum UpdateMyRoomTopFriends: CallableContract { public typealias Request = UpdateMyRoomTopFriendsRequest; public typealias Response = Room; public static let name = CallableName.updateMyRoomTopFriends }
    public enum ListRoomPhotos: CallableContract { public typealias Request = RoomReference; public typealias Response = Page<RoomPhoto>; public static let name = CallableName.listRoomPhotos }
    public enum ListMyMemories: CallableContract { public typealias Request = ListMyMemoriesRequest; public typealias Response = Page<MemoryItem>; public static let name = CallableName.listMyMemories }
    public enum GetMyMemorySummary: CallableContract { public typealias Request = MyMemorySummaryRequest; public typealias Response = MemorySummary; public static let name = CallableName.getMyMemorySummary }
    public enum ListBoxMemories: CallableContract { public typealias Request = ListBoxMemoriesRequest; public typealias Response = Page<MemoryItem>; public static let name = CallableName.listBoxMemories }
    public enum GetBoxMemorySummary: CallableContract { public typealias Request = BoxMemorySummaryRequest; public typealias Response = MemorySummary; public static let name = CallableName.getBoxMemorySummary }
    public enum ListRoomMemories: CallableContract { public typealias Request = ListRoomMemoriesRequest; public typealias Response = Page<MemoryItem>; public static let name = CallableName.listRoomMemories }
    public enum GetRoomMemorySummary: CallableContract { public typealias Request = RoomMemorySummaryRequest; public typealias Response = MemorySummary; public static let name = CallableName.getRoomMemorySummary }

    public static let all: [any CallableContract.Type] = [
        BeginBoxDeletion.self,
        BoxDeletionStatus.self,
        CreateLifeUpdate.self,
        GetLifeUpdate.self,
        ListMyLifeUpdates.self,
        EditLifeUpdate.self,
        DeleteLifeUpdate.self,
        InviteBox.self,
        ProvisionMyAccount.self,
        SendFriendRequest.self,
        AcceptFriendRequest.self,
        CloseFriendship.self,
        ListMyFriendships.self,
        ListMyBoxInvitations.self,
        ListBoxInvitations.self,
        ListBoxMembers.self,
        AcceptBoxInvitation.self,
        DeclineBoxInvitation.self,
        RevokeBoxInvitation.self,
        ReserveUsername.self,
        CreateBoxPost.self,
        GetBoxPost.self,
        ListBoxPosts.self,
        EditBoxPost.self,
        DeleteBoxPost.self,
        SetUserBlock.self,
        ListMyBlocks.self,
        CreateBoxComment.self,
        ListBoxComments.self,
        EditBoxComment.self,
        DeleteBoxComment.self,
        SetBoxReaction.self,
        ListBoxReactions.self,
        ReportBoxPost.self,
        ListModerationReports.self,
        HideReportedPost.self,
        GetMyProfile.self,
        UpdateMyProfile.self,
        UpdateMyPreferences.self,
        ListMyBoxes.self,
        CreateBox.self,
        GetBox.self,
        ListMyNotifications.self,
        CountMyUnreadNotifications.self,
        MarkNotificationRead.self,
        MarkAllNotificationsRead.self,
        GetHomeFeed.self,
        CreateMediaUpload.self,
        CompleteMediaUpload.self,
        GetMediaAsset.self,
        GetMyRoom.self,
        GetRoom.self,
        UpdateMyRoom.self,
        UpdateMyRoomWidgets.self,
        UpdateMyRoomTopFriends.self,
        ListRoomPhotos.self,
        ListMyMemories.self,
        GetMyMemorySummary.self,
        ListBoxMemories.self,
        GetBoxMemorySummary.self,
        ListRoomMemories.self,
        GetRoomMemorySummary.self,
    ]
}
