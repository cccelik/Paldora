import Foundation

/// Every callable, raw value = exact callable name (region `europe-west4`).
public enum CallableName: String, CaseIterable, Hashable, Sendable {
    case beginBoxDeletion, boxDeletionStatus
    case createLifeUpdate, getLifeUpdate, listMyLifeUpdates, editLifeUpdate, deleteLifeUpdate
    case inviteBox, provisionMyAccount, sendFriendRequest, acceptFriendRequest, closeFriendship
    case listMyFriendships, listMyBoxInvitations, listBoxInvitations, listBoxMembers
    case acceptBoxInvitation, declineBoxInvitation, revokeBoxInvitation, reserveUsername
    case createBoxPost, getBoxPost, listBoxPosts, editBoxPost, deleteBoxPost, setUserBlock
    case createBoxComment, listBoxComments, editBoxComment, deleteBoxComment
    case setBoxReaction, listBoxReactions
    case reportBoxPost, listModerationReports, hideReportedPost
    case getMyProfile, updateMyProfile, updateMyPreferences
    case listMyBoxes, createBox, getBox
    case listMyNotifications, countMyUnreadNotifications, markNotificationRead, markAllNotificationsRead
    case getHomeFeed
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
}
