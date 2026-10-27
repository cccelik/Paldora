import Foundation

/// Every callable, raw value = exact callable name (region `europe-west4`).
public enum CallableName: String, CaseIterable, Hashable, Sendable {
    case beginBoxDeletion, boxDeletionStatus
    case createLifeUpdate, getLifeUpdate, listMyLifeUpdates, editLifeUpdate, deleteLifeUpdate
    case inviteBox, provisionMyAccount, sendFriendRequest, acceptFriendRequest, closeFriendship
    case listMyFriendships, listMyBoxInvitations, listBoxInvitations, listBoxMembers
    case acceptBoxInvitation, declineBoxInvitation, revokeBoxInvitation, reserveUsername
    case createBoxPost, getBoxPost, listBoxPosts, editBoxPost, deleteBoxPost, setUserBlock, listMyBlocks
    case createBoxComment, listBoxComments, editBoxComment, deleteBoxComment
    case setBoxReaction, listBoxReactions
    case reportBoxPost, listModerationReports, hideReportedPost
    case getMyProfile, updateMyProfile, updateMyPreferences
    case listMyBoxes, createBox, getBox
    case listMyNotifications, countMyUnreadNotifications, markNotificationRead, markAllNotificationsRead
    case getHomeFeed
    case createMediaUpload, completeMediaUpload, getMediaAsset
    case getMyRoom, getRoom, updateMyRoom, updateMyRoomWidgets, updateMyRoomTopFriends, listRoomPhotos
    case listMyMemories, getMyMemorySummary, listBoxMemories, getBoxMemorySummary
    case listRoomMemories, getRoomMemorySummary
    case changeMyPassword, signOutEverywhere
    case requestAccountExport, getAccountExport
    case getAccountDeletion, requestAccountDeletion, cancelAccountDeletion
    case reportBoxComment, listMyReports, listMyModerationNotices
    case updateBox, setBoxMemberRole, removeBoxMember, leaveBox, transferBoxOwnership
    case cancelFriendRequest
    case listBoxCommentThreads, listBoxCommentReplies, getBoxCommentThread
    case deleteAvatar
}

/// JSON in, JSON out. The app target implements this with Firebase Functions
/// (`httpsCallable`), converting between `Data` and the SDK's values. On a
/// Functions error it throws `TransportError`.
public protocol CallableTransport: Sendable {
    func call(_ name: CallableName, data: Data?) async throws -> Data
}

/// Ties a callable to its request and response types.
public protocol CallableContract: Sendable {
    associatedtype Request: Codable & Sendable & Equatable
    associatedtype Response: Codable & Sendable & Equatable
    static var name: CallableName { get }
}

/// Typed access to the callables. Stateless apart from the transport.
public struct PaldoraAPI: Sendable {
    private let transport: any CallableTransport

    public init(transport: any CallableTransport) {
        self.transport = transport
    }

    /// Encodes, calls, decodes. A `TransportError` becomes `PaldoraFailure`;
    /// anything else the transport throws (for example cancellation) passes through.
    public func perform<C: CallableContract>(
        _ contract: C.Type,
        _ request: C.Request
    ) async throws -> C.Response {
        let body: Data
        do {
            body = try JSONEncoder().encode(request)
        } catch {
            throw ContractError.malformedRequest(C.name)
        }
        let output: Data
        do {
            output = try await transport.call(C.name, data: body)
        } catch let error as TransportError {
            throw PaldoraFailure(error)
        }
        do {
            return try JSONDecoder().decode(C.Response.self, from: output)
        } catch {
            throw ContractError.malformedResponse(C.name)
        }
    }
}

// MARK: - Typed methods

extension PaldoraAPI {
    // Profile and preferences
    public func getMyProfile() async throws -> MyProfile {
        try await perform(Contracts.GetMyProfile.self, EmptyRequest())
    }
    public func updateMyProfile(_ request: UpdateMyProfileRequest) async throws -> MyProfile {
        try await perform(Contracts.UpdateMyProfile.self, request)
    }
    /// Removes the avatar and any pending avatar upload.
    public func deleteAvatar() async throws -> OkResponse {
        try await perform(Contracts.DeleteAvatar.self, EmptyRequest())
    }
    public func updateMyPreferences(_ request: UpdateMyPreferencesRequest) async throws -> Preferences {
        try await perform(Contracts.UpdateMyPreferences.self, request)
    }

    // Account
    public func provisionMyAccount() async throws -> OkResponse {
        try await perform(Contracts.ProvisionMyAccount.self, EmptyRequest())
    }
    public func reserveUsername(_ username: String) async throws -> ReserveUsernameResponse {
        try await perform(Contracts.ReserveUsername.self, ReserveUsernameRequest(username: username))
    }

    // Boxes
    public func listMyBoxes(cursor: String? = nil) async throws -> Page<Box> {
        try await perform(Contracts.ListMyBoxes.self, CursorRequest(cursor: cursor))
    }
    public func createBox(name: String) async throws -> Box {
        try await perform(Contracts.CreateBox.self, CreateBoxRequest(name: name))
    }
    public func getBox(boxId: String) async throws -> Box {
        try await perform(Contracts.GetBox.self, BoxReference(boxId: boxId))
    }
    public func listBoxMembers(_ request: ListBoxMembersRequest) async throws -> Page<BoxMember> {
        try await perform(Contracts.ListBoxMembers.self, request)
    }
    public func beginBoxDeletion(_ request: BeginBoxDeletionRequest) async throws -> BeginBoxDeletionResponse {
        try await perform(Contracts.BeginBoxDeletion.self, request)
    }
    public func boxDeletionStatus(boxId: String) async throws -> BoxDeletionProgress {
        try await perform(Contracts.BoxDeletionStatus.self, BoxReference(boxId: boxId))
    }
    /// Owner only: rename, archive or restore.
    public func updateBox(_ request: UpdateBoxRequest) async throws -> Box {
        try await perform(Contracts.UpdateBox.self, request)
    }
    public func setBoxMemberRole(_ request: SetBoxMemberRoleRequest) async throws -> OkResponse {
        try await perform(Contracts.SetBoxMemberRole.self, request)
    }
    public func removeBoxMember(_ request: BoxMemberReference) async throws -> OkResponse {
        try await perform(Contracts.RemoveBoxMember.self, request)
    }
    /// The owner must transfer ownership first.
    public func leaveBox(boxId: String) async throws -> OkResponse {
        try await perform(Contracts.LeaveBox.self, BoxReference(boxId: boxId))
    }
    public func transferBoxOwnership(_ request: BoxMemberReference) async throws -> OkResponse {
        try await perform(Contracts.TransferBoxOwnership.self, request)
    }

    // Notifications
    public func listMyNotifications(cursor: String? = nil) async throws -> NotificationPage {
        try await perform(Contracts.ListMyNotifications.self, CursorRequest(cursor: cursor))
    }
    public func countMyUnreadNotifications() async throws -> UnreadCount {
        try await perform(Contracts.CountMyUnreadNotifications.self, EmptyRequest())
    }
    public func markNotificationRead(id: String) async throws -> PaldoraNotification {
        try await perform(Contracts.MarkNotificationRead.self, NotificationReference(id: id))
    }
    public func markAllNotificationsRead() async throws -> OkResponse {
        try await perform(Contracts.MarkAllNotificationsRead.self, EmptyRequest())
    }

    // Feed
    public func getHomeFeed(cursor: String? = nil) async throws -> Page<FeedItem> {
        try await perform(Contracts.GetHomeFeed.self, CursorRequest(cursor: cursor))
    }

    // Posts
    public func createBoxPost(_ request: CreateBoxPostRequest) async throws -> CreateBoxPostResponse {
        try await perform(Contracts.CreateBoxPost.self, request)
    }
    public func getBoxPost(_ request: PostReference) async throws -> BoxPost {
        try await perform(Contracts.GetBoxPost.self, request)
    }
    public func listBoxPosts(_ request: ListBoxPostsRequest) async throws -> Page<BoxPost> {
        try await perform(Contracts.ListBoxPosts.self, request)
    }
    public func editBoxPost(_ request: EditBoxPostRequest) async throws -> OkResponse {
        try await perform(Contracts.EditBoxPost.self, request)
    }
    public func deleteBoxPost(_ request: PostReference) async throws -> OkResponse {
        try await perform(Contracts.DeleteBoxPost.self, request)
    }

    // Comments
    public func createBoxComment(_ request: CreateBoxCommentRequest) async throws -> CreateBoxCommentResponse {
        try await perform(Contracts.CreateBoxComment.self, request)
    }
    public func listBoxComments(_ request: ListBoxCommentsRequest) async throws -> Page<BoxComment> {
        try await perform(Contracts.ListBoxComments.self, request)
    }
    public func listBoxCommentThreads(_ request: ListBoxCommentsRequest) async throws -> Page<CommentThread> {
        try await perform(Contracts.ListBoxCommentThreads.self, request)
    }
    public func listBoxCommentReplies(_ request: ListBoxCommentRepliesRequest) async throws -> Page<CommentItem> {
        try await perform(Contracts.ListBoxCommentReplies.self, request)
    }
    public func getBoxCommentThread(_ request: GetBoxCommentThreadRequest) async throws -> CommentThread {
        try await perform(Contracts.GetBoxCommentThread.self, request)
    }
    public func editBoxComment(_ request: EditBoxCommentRequest) async throws -> OkResponse {
        try await perform(Contracts.EditBoxComment.self, request)
    }
    public func deleteBoxComment(_ request: DeleteBoxCommentRequest) async throws -> OkResponse {
        try await perform(Contracts.DeleteBoxComment.self, request)
    }

    // Reactions
    public func setBoxReaction(_ request: SetBoxReactionRequest) async throws -> OkResponse {
        try await perform(Contracts.SetBoxReaction.self, request)
    }
    public func listBoxReactions(_ request: ListBoxReactionsRequest) async throws -> Page<BoxReaction> {
        try await perform(Contracts.ListBoxReactions.self, request)
    }

    // Friendships and blocks
    public func sendFriendRequest(username: String) async throws -> SendFriendRequestResponse {
        try await perform(Contracts.SendFriendRequest.self, SendFriendRequestRequest(username: username))
    }
    public func acceptFriendRequest(requestId: String) async throws -> OkResponse {
        try await perform(Contracts.AcceptFriendRequest.self, FriendRequestReference(requestId: requestId))
    }
    public func closeFriendship(requestId: String) async throws -> OkResponse {
        try await perform(Contracts.CloseFriendship.self, FriendRequestReference(requestId: requestId))
    }
    /// Withdraws your own pending request (deletes it; `closeFriendship` declines).
    public func cancelFriendRequest(requestId: String) async throws -> OkResponse {
        try await perform(Contracts.CancelFriendRequest.self, FriendRequestReference(requestId: requestId))
    }
    public func listMyFriendships(_ request: ListMyFriendshipsRequest) async throws -> Page<Friendship> {
        try await perform(Contracts.ListMyFriendships.self, request)
    }
    public func setUserBlock(targetUid: String, blocked: Bool) async throws -> OkResponse {
        try await perform(Contracts.SetUserBlock.self, SetUserBlockRequest(targetUid: targetUid, blocked: blocked))
    }

    // Invitations
    public func inviteBox(_ request: InviteBoxRequest) async throws -> InviteBoxResponse {
        try await perform(Contracts.InviteBox.self, request)
    }
    public func acceptBoxInvitation(invitationId: String) async throws -> AcceptBoxInvitationResponse {
        try await perform(Contracts.AcceptBoxInvitation.self, InvitationReference(invitationId: invitationId))
    }
    public func declineBoxInvitation(invitationId: String) async throws -> OkResponse {
        try await perform(Contracts.DeclineBoxInvitation.self, InvitationReference(invitationId: invitationId))
    }
    public func revokeBoxInvitation(_ request: RevokeBoxInvitationRequest) async throws -> OkResponse {
        try await perform(Contracts.RevokeBoxInvitation.self, request)
    }
    /// The cursor here is a 64-character lowercase hex string the server returned.
    public func listMyBoxInvitations(cursor: String? = nil) async throws -> Page<MyBoxInvitation> {
        try await perform(Contracts.ListMyBoxInvitations.self, CursorRequest(cursor: cursor))
    }
    public func listBoxInvitations(_ request: ListBoxInvitationsRequest) async throws -> Page<BoxInvitation> {
        try await perform(Contracts.ListBoxInvitations.self, request)
    }

    public func listMyBlocks(cursor: String? = nil) async throws -> Page<BlockedUser> {
        try await perform(Contracts.ListMyBlocks.self, CursorRequest(cursor: cursor))
    }

    // Life Updates
    public func createLifeUpdate(_ request: CreateLifeUpdateRequest) async throws -> CreateLifeUpdateResponse {
        try await perform(Contracts.CreateLifeUpdate.self, request)
    }
    public func getLifeUpdate(id: String) async throws -> LifeUpdate {
        try await perform(Contracts.GetLifeUpdate.self, LifeUpdateReference(id: id))
    }
    public func listMyLifeUpdates(cursor: String? = nil) async throws -> Page<LifeUpdate> {
        try await perform(Contracts.ListMyLifeUpdates.self, CursorRequest(cursor: cursor))
    }
    public func editLifeUpdate(_ request: EditLifeUpdateRequest) async throws -> OkResponse {
        try await perform(Contracts.EditLifeUpdate.self, request)
    }
    public func deleteLifeUpdate(id: String) async throws -> OkResponse {
        try await perform(Contracts.DeleteLifeUpdate.self, LifeUpdateReference(id: id))
    }

    // Media (bytes travel over the `mediaUpload` / `mediaRead` HTTP Functions)
    public func createMediaUpload(_ request: CreateMediaUploadRequest) async throws -> CreateMediaUploadResponse {
        try await perform(Contracts.CreateMediaUpload.self, request)
    }
    public func completeMediaUpload(assetId: String) async throws -> MediaAsset {
        try await perform(Contracts.CompleteMediaUpload.self, MediaAssetReference(assetId: assetId))
    }
    public func getMediaAsset(assetId: String) async throws -> MediaAssetDetails {
        try await perform(Contracts.GetMediaAsset.self, MediaAssetReference(assetId: assetId))
    }

    // Rooms (absence, a hidden Room and a block are all `notFound`)
    public func getMyRoom() async throws -> Room {
        try await perform(Contracts.GetMyRoom.self, EmptyRequest())
    }
    public func getRoom(username: String) async throws -> Room {
        try await perform(Contracts.GetRoom.self, RoomReference(username: username))
    }
    public func updateMyRoom(_ request: UpdateMyRoomRequest) async throws -> Room {
        try await perform(Contracts.UpdateMyRoom.self, request)
    }
    public func updateMyRoomWidgets(_ request: UpdateMyRoomWidgetsRequest) async throws -> Room {
        try await perform(Contracts.UpdateMyRoomWidgets.self, request)
    }
    public func updateMyRoomTopFriends(_ request: UpdateMyRoomTopFriendsRequest) async throws -> Room {
        try await perform(Contracts.UpdateMyRoomTopFriends.self, request)
    }
    public func listRoomPhotos(username: String) async throws -> Page<RoomPhoto> {
        try await perform(Contracts.ListRoomPhotos.self, RoomReference(username: username))
    }

    // Memories (derived and re-authorized on every read)
    public func listMyMemories(_ request: ListMyMemoriesRequest = .init()) async throws -> Page<MemoryItem> {
        try await perform(Contracts.ListMyMemories.self, request)
    }
    public func getMyMemorySummary(year: Int? = nil) async throws -> MemorySummary {
        try await perform(Contracts.GetMyMemorySummary.self, MyMemorySummaryRequest(year: year))
    }
    public func listBoxMemories(_ request: ListBoxMemoriesRequest) async throws -> Page<MemoryItem> {
        try await perform(Contracts.ListBoxMemories.self, request)
    }
    public func getBoxMemorySummary(boxId: String, year: Int? = nil) async throws -> MemorySummary {
        try await perform(Contracts.GetBoxMemorySummary.self, BoxMemorySummaryRequest(boxId: boxId, year: year))
    }
    public func listRoomMemories(_ request: ListRoomMemoriesRequest) async throws -> Page<MemoryItem> {
        try await perform(Contracts.ListRoomMemories.self, request)
    }
    public func getRoomMemorySummary(username: String, year: Int? = nil) async throws -> MemorySummary {
        try await perform(Contracts.GetRoomMemorySummary.self, RoomMemorySummaryRequest(username: username, year: year))
    }

    // Moderation
    public func reportBoxPost(_ request: ReportBoxPostRequest) async throws -> ReportBoxPostResponse {
        try await perform(Contracts.ReportBoxPost.self, request)
    }
    public func listModerationReports(cursor: String? = nil) async throws -> Page<ModerationReport> {
        try await perform(Contracts.ListModerationReports.self, CursorRequest(cursor: cursor))
    }
    public func hideReportedPost(reportId: String) async throws -> OkResponse {
        try await perform(Contracts.HideReportedPost.self, HideReportedPostRequest(reportId: reportId))
    }

    // Password and sessions (both end every older session: sign in again)
    public func changeMyPassword(_ request: ChangeMyPasswordRequest) async throws -> SessionEndedResponse {
        try await perform(Contracts.ChangeMyPassword.self, request)
    }
    public func signOutEverywhere() async throws -> SessionEndedResponse {
        try await perform(Contracts.SignOutEverywhere.self, EmptyRequest())
    }

    // Account export (bytes: GET `accountExportDownload/{exportId}` with the ID token)
    public func requestAccountExport() async throws -> AccountExport {
        try await perform(Contracts.RequestAccountExport.self, EmptyRequest()).export
    }
    public func getAccountExport() async throws -> AccountExport? {
        try await perform(Contracts.GetAccountExport.self, EmptyRequest()).export
    }

    // Account deletion (seven-day grace; owned Boxes must be transferred first)
    public func getAccountDeletion() async throws -> AccountDeletion? {
        try await perform(Contracts.GetAccountDeletion.self, EmptyRequest()).deletion
    }
    public func requestAccountDeletion(password: String) async throws -> AccountDeletion {
        try await perform(Contracts.RequestAccountDeletion.self, PasswordConfirmationRequest(password: password)).deletion
    }
    public func cancelAccountDeletion(password: String) async throws -> AccountDeletion {
        try await perform(Contracts.CancelAccountDeletion.self, PasswordConfirmationRequest(password: password)).deletion
    }

    // Reports and notices for ordinary users
    public func reportBoxComment(_ request: ReportBoxCommentRequest) async throws -> ReportBoxCommentResponse {
        try await perform(Contracts.ReportBoxComment.self, request)
    }
    public func listMyReports(cursor: String? = nil) async throws -> Page<ReportReceipt> {
        try await perform(Contracts.ListMyReports.self, CursorRequest(cursor: cursor))
    }
    public func listMyModerationNotices() async throws -> [ModerationNotice] {
        try await perform(Contracts.ListMyModerationNotices.self, EmptyRequest()).items
    }
}
